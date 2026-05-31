// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.
const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// 获取我的合同
router.get('/my', authMiddleware, (req, res) => {
  const contracts = db.prepare(`
    SELECT c.*, p.title as project_title, p.category,
      u1.username as owner_name, u1.real_name as owner_real_name,
      u2.username as engineer_name, u2.real_name as engineer_real_name
    FROM contracts c
    JOIN projects p ON c.project_id = p.id
    JOIN users u1 ON c.owner_id = u1.id
    JOIN users u2 ON c.engineer_id = u2.id
    WHERE c.owner_id = ? OR c.engineer_id = ?
    ORDER BY c.signed_at DESC
  `).all(req.user.id, req.user.id);
  res.json(contracts);
});

// 确认完工
router.post('/:id/complete', authMiddleware, (req, res) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  if (contract.owner_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (contract.status !== 'active') return res.status(400).json({ error: '合同状态不允许此操作' });

  const owner = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  if (owner.balance < contract.amount) {
    return res.status(400).json({ error: `余额不足，需要 ${contract.amount} 元，当前余额 ${owner.balance} 元` });
  }

  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(contract.amount, contract.owner_id);
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(contract.amount, contract.engineer_id);
  db.prepare('UPDATE contracts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', contract.id);
  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('completed', contract.project_id);

  const project = db.prepare('SELECT title FROM projects WHERE id = ?').get(contract.project_id);
  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, contract.engineer_id, '工程已完工确认',
    `工程「${project.title}」已确认完工，${contract.amount} 元已转入您的账户`, 'contract'
  );

  logAudit(req.user.id, 'complete_contract', 'contract', contract.id, null, req.ip);
  res.json({ message: '工程已确认完工，款项已结算' });
});

// 终止合同
router.post('/:id/terminate', authMiddleware, (req, res) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  if (contract.owner_id !== req.user.id && contract.engineer_id !== req.user.id) {
    return res.status(403).json({ error: '无权操作' });
  }
  if (contract.status !== 'active') return res.status(400).json({ error: '合同状态不允许此操作' });

  db.prepare('UPDATE contracts SET status = ? WHERE id = ?').run('terminated', contract.id);
  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('cancelled', contract.project_id);

  const otherUserId = req.user.id === contract.owner_id ? contract.engineer_id : contract.owner_id;
  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, otherUserId, '合同已终止', '合同已被终止', 'contract'
  );

  res.json({ message: '合同已终止' });
});

module.exports = router;
