const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// 投标
router.post('/', authMiddleware, requireRole('engineer'), (req, res) => {
  const { project_id, price, message } = req.body;
  if (!project_id || !price) return res.status(400).json({ error: '工程ID和报价不能为空' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(project_id));
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (project.status !== 'bidding') return res.status(400).json({ error: '该工程不在招标中' });
  if (project.user_id === req.user.id) return res.status(400).json({ error: '不能对自己的工程投标' });

  const existing = db.prepare('SELECT id FROM bids WHERE project_id = ? AND engineer_id = ?').get(Number(project_id), req.user.id);
  if (existing) return res.status(400).json({ error: '您已对此工程投标' });

  const result = db.prepare('INSERT INTO bids (project_id, engineer_id, price, message) VALUES (?, ?, ?, ?)')
    .run(Number(project_id), req.user.id, price, message);

  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, project.user_id, '新的投标',
    `用户 ${req.user.username} 对您的工程「${project.title}」投标，报价 ${price} 元`, 'bid'
  );

  logAudit(req.user.id, 'submit_bid', 'bid', result.lastInsertRowid, `project:${project_id},price:${price}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '投标成功' });
});

// 接受投标
router.post('/:id/accept', authMiddleware, (req, res) => {
  const bid = db.prepare('SELECT b.*, p.user_id as owner_id, p.title, p.status as project_status FROM bids b JOIN projects p ON b.project_id = p.id WHERE b.id = ?').get(Number(req.params.id));
  if (!bid) return res.status(404).json({ error: '投标不存在' });
  if (bid.owner_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (bid.project_status !== 'bidding') return res.status(400).json({ error: '工程状态不允许操作' });

  db.prepare('UPDATE bids SET status = ? WHERE id = ?').run('accepted', Number(req.params.id));
  db.prepare('UPDATE bids SET status = ? WHERE project_id = ? AND id != ? AND status = ?').run('rejected', bid.project_id, Number(req.params.id), 'pending');
  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('in_progress', bid.project_id);
  db.prepare('INSERT INTO contracts (project_id, bid_id, owner_id, engineer_id, amount) VALUES (?, ?, ?, ?, ?)')
    .run(bid.project_id, Number(req.params.id), bid.owner_id, bid.engineer_id, bid.price);

  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, bid.engineer_id, '投标已中标',
    `恭喜！您对工程「${bid.title}」的投标已被接受，报价 ${bid.price} 元。合同已自动生成。`, 'bid'
  );

  const rejectedBids = db.prepare('SELECT engineer_id FROM bids WHERE project_id = ? AND id != ?').all(bid.project_id, Number(req.params.id));
  rejectedBids.forEach(b => {
    db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, b.engineer_id, '投标未中标',
      `您对工程「${bid.title}」的投标未被选中`, 'bid'
    );
  });

  logAudit(req.user.id, 'accept_bid', 'bid', Number(req.params.id), null, req.ip);
  res.json({ message: '已接受投标，合同已生成' });
});

// 拒绝投标
router.post('/:id/reject', authMiddleware, (req, res) => {
  const bid = db.prepare('SELECT b.*, p.user_id as owner_id, p.title FROM bids b JOIN projects p ON b.project_id = p.id WHERE b.id = ?').get(Number(req.params.id));
  if (!bid) return res.status(404).json({ error: '投标不存在' });
  if (bid.owner_id !== req.user.id) return res.status(403).json({ error: '无权操作' });

  db.prepare('UPDATE bids SET status = ? WHERE id = ?').run('rejected', Number(req.params.id));

  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, bid.engineer_id, '投标已被拒绝',
    `您对工程「${bid.title}」的投标已被拒绝`, 'bid'
  );

  res.json({ message: '已拒绝投标' });
});

// 获取我的投标
router.get('/my', authMiddleware, (req, res) => {
  const bids = db.prepare(`
    SELECT b.*, p.title as project_title, p.status as project_status, p.category, p.budget
    FROM bids b JOIN projects p ON b.project_id = p.id
    WHERE b.engineer_id = ? ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json(bids);
});

module.exports = router;
