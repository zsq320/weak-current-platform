const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// 管理员权限检查
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

router.use(authMiddleware, adminOnly);

// ========== 用户管理 ==========

// 获取所有用户（增强版：支持关键词搜索、状态筛选）
router.get('/users', (req, res) => {
  const { page = 1, pageSize = 20, role, keyword, is_disabled } = req.query;
  let sql = 'SELECT id, username, role, real_name, phone, email, certification_status, balance, is_disabled, created_at FROM users WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
  const params = [];
  const countParams = [];

  if (role) {
    sql += ' AND role = ?';
    countSql += ' AND role = ?';
    params.push(role);
    countParams.push(role);
  }
  if (keyword) {
    sql += ' AND (username LIKE ? OR real_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    countSql += ' AND (username LIKE ? OR real_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (is_disabled !== undefined && is_disabled !== '') {
    sql += ' AND is_disabled = ?';
    countSql += ' AND is_disabled = ?';
    params.push(Number(is_disabled));
    countParams.push(Number(is_disabled));
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const total = db.prepare(countSql).get(...countParams).total;
  const users = db.prepare(sql).all(...params);
  res.json({ data: users, total });
});

// 禁用/启用用户
router.put('/users/:id/status', (req, res) => {
  const { is_disabled } = req.body;
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.role === 'admin') return res.status(400).json({ error: '不能禁用管理员账户' });

  db.prepare('UPDATE users SET is_disabled = ? WHERE id = ?').run(is_disabled ? 1 : 0, Number(req.params.id));
  logAudit(req.user.id, is_disabled ? 'disable_user' : 'enable_user', 'user', Number(req.params.id), null, req.ip);

  if (is_disabled) {
    db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, Number(req.params.id), '账户已被禁用', '您的账户已被管理员禁用，如有疑问请联系管理员。', 'system'
    );
  }

  res.json({ message: is_disabled ? '已禁用' : '已启用' });
});

// 变更用户角色
router.put('/users/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['user', 'engineer'].includes(role)) return res.status(400).json({ error: '无效角色' });

  const target = db.prepare('SELECT id, role, username FROM users WHERE id = ?').get(Number(req.params.id));
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.role === 'admin') return res.status(400).json({ error: '不能修改管理员角色' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, Number(req.params.id));
  logAudit(req.user.id, 'change_role', 'user', Number(req.params.id), `to:${role}`, req.ip);

  const roleLabel = role === 'engineer' ? '工程师' : '甲方';
  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, Number(req.params.id), '角色已变更', `您的角色已被管理员变更为「${roleLabel}」`, 'system'
  );

  res.json({ message: '角色已更新' });
});

// ========== 认证审批 ==========

// 获取待审批的认证申请
router.get('/certifications', (req, res) => {
  const rows = db.prepare("SELECT id, username, real_name, phone, email, certification, certification_status, created_at FROM users WHERE certification_status = 'pending'").all();
  res.json(rows);
});

// 审批认证
router.post('/certifications/:userId/approve', (req, res) => {
  const { action } = req.body;
  const status = action === 'approve' ? 'approved' : 'rejected';
  const newRole = action === 'approve' ? 'engineer' : 'user';
  db.prepare('UPDATE users SET certification_status = ?, role = ? WHERE id = ?')
    .run(status, newRole, Number(req.params.userId));

  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, Number(req.params.userId), '认证审批结果',
    action === 'approve' ? '恭喜！您的工程师认证已通过，您现在可以接取工程了。' : '抱歉，您的工程师认证未通过，请补充资料后重新申请。', 'system'
  );

  logAudit(req.user.id, 'cert_' + action, 'user', Number(req.params.userId), null, req.ip);
  res.json({ message: action === 'approve' ? '已批准' : '已拒绝' });
});

// ========== 工程监管 ==========

// 获取所有工程
router.get('/projects', (req, res) => {
  const { page = 1, pageSize = 20, status, keyword } = req.query;
  let sql = 'SELECT p.*, u.username as publisher, u.real_name as publisher_name FROM projects p JOIN users u ON p.user_id = u.id WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as total FROM projects p WHERE 1=1';
  const params = [];
  const countParams = [];

  if (status) {
    sql += ' AND p.status = ?';
    countSql += ' AND p.status = ?';
    params.push(status);
    countParams.push(status);
  }
  if (keyword) {
    sql += ' AND (p.title LIKE ? OR p.description LIKE ?)';
    countSql += ' AND (p.title LIKE ? OR p.description LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
    countParams.push(`%${keyword}%`, `%${keyword}%`);
  }

  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const total = db.prepare(countSql).get(...countParams).total;
  const projects = db.prepare(sql).all(...params);

  // 附加投标数
  const bidCountStmt = db.prepare('SELECT COUNT(*) as count FROM bids WHERE project_id = ?');
  projects.forEach(p => {
    p.bid_count = bidCountStmt.get(p.id).count;
  });

  res.json({ data: projects, total });
});

// 强制取消工程
router.post('/projects/:id/cancel', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(req.params.id));
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (project.status === 'completed' || project.status === 'cancelled') return res.status(400).json({ error: '工程已结束' });

  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('cancelled', Number(req.params.id));
  db.prepare('UPDATE bids SET status = ? WHERE project_id = ? AND status = ?').run('rejected', Number(req.params.id), 'pending');
  db.prepare("UPDATE contracts SET status = 'terminated' WHERE project_id = ? AND status = 'active'").run(Number(req.params.id));

  logAudit(req.user.id, 'force_cancel_project', 'project', Number(req.params.id), null, req.ip);

  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, project.user_id, '工程已被管理员取消', `您的工程「${project.title}」已被管理员强制取消`, 'system'
  );

  res.json({ message: '工程已强制取消' });
});

// ========== 合同监管 ==========

// 获取所有合同
router.get('/contracts', (req, res) => {
  const { page = 1, pageSize = 20, status } = req.query;
  let sql = `SELECT c.*, p.title as project_title,
    u1.username as owner_name, u1.real_name as owner_real_name,
    u2.username as engineer_name, u2.real_name as engineer_real_name
    FROM contracts c
    JOIN projects p ON c.project_id = p.id
    JOIN users u1 ON c.owner_id = u1.id
    JOIN users u2 ON c.engineer_id = u2.id WHERE 1=1`;
  let countSql = 'SELECT COUNT(*) as total FROM contracts WHERE 1=1';
  const params = [];
  const countParams = [];

  if (status) {
    sql += ' AND c.status = ?';
    countSql += ' AND status = ?';
    params.push(status);
    countParams.push(status);
  }

  sql += ' ORDER BY c.signed_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const total = db.prepare(countSql).get(...countParams).total;
  const contracts = db.prepare(sql).all(...params);
  res.json({ data: contracts, total });
});

// ========== 财务概览 ==========

// 获取交易记录（已完成的合同）
router.get('/transactions', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const sql = `SELECT c.id, c.amount, c.completed_at, p.title as project_title,
    u1.real_name as owner_name, u2.real_name as engineer_name
    FROM contracts c
    JOIN projects p ON c.project_id = p.id
    JOIN users u1 ON c.owner_id = u1.id
    JOIN users u2 ON c.engineer_id = u2.id
    WHERE c.status = 'completed' ORDER BY c.completed_at DESC LIMIT ? OFFSET ?`;
  const countSql = "SELECT COUNT(*) as total FROM contracts WHERE status = 'completed'";
  const total = db.prepare(countSql).get().total;
  const transactions = db.prepare(sql).all(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const totalAmount = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM contracts WHERE status = 'completed'").get().total;
  res.json({ data: transactions, total, totalAmount });
});

// ========== 操作日志 ==========

// 获取操作日志
router.get('/audit-logs', (req, res) => {
  const { page = 1, pageSize = 50, action, user_id } = req.query;
  let sql = 'SELECT a.*, u.username FROM audit_logs a JOIN users u ON a.user_id = u.id WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
  const params = [];
  const countParams = [];

  if (action) {
    sql += ' AND a.action = ?';
    countSql += ' AND action = ?';
    params.push(action);
    countParams.push(action);
  }
  if (user_id) {
    sql += ' AND a.user_id = ?';
    countSql += ' AND user_id = ?';
    params.push(Number(user_id));
    countParams.push(Number(user_id));
  }

  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const total = db.prepare(countSql).get(...countParams).total;
  const logs = db.prepare(sql).all(...params);
  res.json({ data: logs, total });
});

// ========== 增强统计 ==========

router.get('/stats', (req, res) => {
  const total_users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const total_projects = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
  const total_contracts = db.prepare('SELECT COUNT(*) as count FROM contracts').get().count;
  const total_revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM contracts WHERE status = 'completed'").get().total;
  const pending_certs = db.prepare("SELECT COUNT(*) as count FROM users WHERE certification_status = 'pending'").get().count;

  // 按角色统计用户
  const users_by_role = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all();

  // 按状态统计工程
  const projects_by_status = db.prepare('SELECT status, COUNT(*) as count FROM projects GROUP BY status').all();

  // 按状态统计合同
  const contracts_by_status = db.prepare('SELECT status, COUNT(*) as count FROM contracts GROUP BY status').all();

  // 月度收入趋势（近6个月）
  const monthly_revenue = db.prepare(`
    SELECT strftime('%Y-%m', completed_at) as month, SUM(amount) as total
    FROM contracts WHERE status = 'completed'
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse();

  // 最近活动
  const recent_activity = db.prepare(`
    SELECT a.*, u.username FROM audit_logs a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC LIMIT 10
  `).all();

  res.json({
    total_users, total_projects, total_contracts, total_revenue, pending_certs,
    users_by_role, projects_by_status, contracts_by_status, monthly_revenue, recent_activity
  });
});

module.exports = router;
