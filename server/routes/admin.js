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
const { postLedger, recordPlatformIncome, getSetting, setSetting, getNumberSetting } = require('../utils/ledger');

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
  // certification 字段为 JSON（{description, images}），解析后便于前端展示
  res.json(rows.map(row => {
    let description = row.certification;
    let imageCount = 0;
    try {
      const parsed = JSON.parse(row.certification);
      if (parsed && typeof parsed === 'object') {
        description = parsed.description || '';
        imageCount = Array.isArray(parsed.images) ? parsed.images.length : 0;
      }
    } catch (e) {
      // 兼容旧数据（纯文本）
    }
    const imageList = (() => {
      try {
        const parsed = JSON.parse(row.certification);
        return Array.isArray(parsed?.images) ? parsed.images : [];
      } catch (e) { return []; }
    })();
    return { ...row, certification_description: description, certification_image_count: imageCount, certification_images: imageList };
  }));
});

// 审批认证
router.post('/certifications/:userId/approve', (req, res) => {
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: '无效的审批操作' });
  }

  const target = db.prepare('SELECT id, certification_status FROM users WHERE id = ?').get(Number(req.params.userId));
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.certification_status !== 'pending') {
    return res.status(400).json({ error: '该用户没有待审批的认证申请' });
  }

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
  const total_engineers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'engineer' OR certification_status = 'approved'").get().count;
  const total_clients = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user'").get().count;

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
    total_engineers, total_clients,
    users_by_role, projects_by_status, contracts_by_status, monthly_revenue, recent_activity
  });
});


// ========== 商用化扩展：资金审核 / 纠纷仲裁 / 内容审核 / 报表 / 设置 / 备份 ==========

// 提现审核列表
router.get('/withdrawals', (req, res) => {
  const status = ['pending', 'approved', 'rejected', 'paid'].includes(req.query.status) ? req.query.status : null;
  const items = status
    ? db.prepare("SELECT w.*, u.username, u.real_name FROM withdrawal_requests w JOIN users u ON w.user_id = u.id WHERE w.status = ? ORDER BY w.id DESC LIMIT 100").all(status)
    : db.prepare("SELECT w.*, u.username, u.real_name FROM withdrawal_requests w JOIN users u ON w.user_id = u.id ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.id DESC LIMIT 100").all();
  res.json({ items });
});

// 提现审核：approve=确认打款（余额已在申请时冻结）、reject=退回余额
router.post('/withdrawals/:id/process', (req, res) => {
  const wr = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(Number(req.params.id));
  if (!wr) return res.status(404).json({ error: '提现申请不存在' });
  if (wr.status !== 'pending') return res.status(400).json({ error: '该申请已处理' });

  const { action, reject_reason } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
  if (action === 'reject' && !String(reject_reason || '').trim()) return res.status(400).json({ error: '请填写驳回原因' });

  const processTx = db.transaction(() => {
    if (action === 'approve') {
      db.prepare("UPDATE withdrawal_requests SET status = 'paid', processed_by = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(req.user.id, wr.id);
      recordPlatformIncome({ type: 'withdraw', amount: wr.amount, refType: 'withdrawal', refId: wr.id, remark: '提现打款给用户#' + wr.user_id });
    } else {
      postLedger({ userId: wr.user_id, amount: wr.amount, type: 'withdraw_refund', refType: 'withdrawal', refId: wr.id, remark: '提现被驳回，余额退回：' + String(reject_reason).trim(), operatorId: req.user.id });
      db.prepare("UPDATE withdrawal_requests SET status = 'rejected', reject_reason = ?, processed_by = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(String(reject_reason).trim(), req.user.id, wr.id);
    }
  });

  try {
    processTx();
  } catch (err) {
    return res.status(500).json({ error: err.message || '处理失败' });
  }
  logAudit(req.user.id, 'process_withdrawal', 'withdrawal', wr.id, { action }, req.ip);
  res.json({ message: action === 'approve' ? '已确认打款' : '已驳回并退回余额' });
});

// 纠纷仲裁：支持按结果处置资金（退款给甲方/放款给乙方）
router.post('/disputes/:id/arbitrate', (req, res) => {
  const d = db.prepare('SELECT * FROM disputes WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: '纠纷单不存在' });
  if (['resolved', 'closed'].includes(d.status)) return res.status(400).json({ error: '该纠纷已办结' });

  const { resolution, refund_amount, target } = req.body; // target: owner(退款给甲方)/engineer(放款给乙方)
  if (!String(resolution || '').trim()) return res.status(400).json({ error: '请填写仲裁处理意见' });
  const refund = Math.round(Number(refund_amount) * 100) / 100;

  const arbitrateTx = db.transaction(() => {
    let contract = null;
    if (d.contract_id) contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(d.contract_id);

    if (contract && contract.status === 'active' && refund > 0 && ['owner', 'engineer'].includes(target)) {
      if (target === 'engineer') {
        postLedger({ userId: contract.engineer_id, amount: refund, type: 'settlement', refType: 'dispute', refId: d.id, remark: '纠纷仲裁放款（纠纷#' + d.id + '）' });
      } else {
        postLedger({ userId: contract.owner_id, amount: refund, type: 'refund', refType: 'dispute', refId: d.id, remark: '纠纷仲裁退款（纠纷#' + d.id + '）' });
      }
      if (contract.escrow_status === 'frozen' && target === 'owner') {
        db.prepare("UPDATE contracts SET escrow_status = 'refunded' WHERE id = ?").run(contract.id);
      }
    }

    db.prepare("UPDATE disputes SET status = 'resolved', resolution = ?, refund_amount = ?, handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(String(resolution).trim(), refund > 0 ? refund : 0, req.user.id, d.id);
  });

  try {
    arbitrateTx();
  } catch (err) {
    return res.status(500).json({ error: err.message || '仲裁失败' });
  }
  logAudit(req.user.id, 'arbitrate_dispute', 'dispute', d.id, { refund, target }, req.ip);
  res.json({ message: '仲裁已完成' });
});

// 发票处理
router.post('/invoices/:id/process', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: '发票申请不存在' });
  const { action, remark } = req.body; // approve/reject/issue
  if (!['approve', 'reject', 'issue'].includes(action)) return res.status(400).json({ error: '无效操作' });
  const statusMap = { approve: 'approved', reject: 'rejected', issue: 'issued' };
  db.prepare('UPDATE invoices SET status = ?, remark = COALESCE(?, remark), processed_by = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(statusMap[action], remark || null, req.user.id, inv.id);
  logAudit(req.user.id, 'process_invoice', 'invoice', inv.id, { action }, req.ip);
  res.json({ message: '发票申请已处理' });
});

// 企业认证审核
router.get('/companies', (req, res) => {
  const items = db.prepare(`
    SELECT c.*, u.username, u.real_name FROM companies c JOIN users u ON c.user_id = u.id
    ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.applied_at DESC LIMIT 100
  `).all();
  res.json({ items });
});

router.post('/companies/:userId/review', (req, res) => {
  const c = db.prepare('SELECT * FROM companies WHERE user_id = ?').get(Number(req.params.userId));
  if (!c) return res.status(404).json({ error: '企业认证不存在' });
  if (c.status !== 'pending') return res.status(400).json({ error: '该认证已处理' });
  const { action, reject_reason } = req.body; // approve/reject
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
  if (action === 'reject' && !String(reject_reason || '').trim()) return res.status(400).json({ error: '请填写驳回原因' });
  db.prepare('UPDATE companies SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(action === 'approve' ? 'approved' : 'rejected', action === 'reject' ? String(reject_reason).trim() : null, req.user.id, c.user_id);
  logAudit(req.user.id, 'review_company', 'company', c.user_id, { action }, req.ip);
  res.json({ message: action === 'approve' ? '企业认证已通过' : '企业认证已驳回' });
});

// 评价申诉处理（可同时撤销违规评价）
router.get('/review-appeals', (req, res) => {
  const items = db.prepare(`
    SELECT ra.*, r.rating, r.comment as review_comment, u.username as appellant_name,
           r.to_user_id as review_target
    FROM review_appeals ra
    LEFT JOIN reviews r ON ra.review_id = r.id
    JOIN users u ON ra.user_id = u.id
    ORDER BY CASE ra.status WHEN 'pending' THEN 0 ELSE 1 END, ra.id DESC LIMIT 100
  `).all();
  res.json({ items });
});

router.post('/review-appeals/:id/process', (req, res) => {
  const ra = db.prepare('SELECT * FROM review_appeals WHERE id = ?').get(Number(req.params.id));
  if (!ra) return res.status(404).json({ error: '申诉不存在' });
  if (ra.status !== 'pending') return res.status(400).json({ error: '该申诉已处理' });
  const { action } = req.body; // uphold(维持)/revoke(撤销并删除评价)
  if (!['uphold', 'revoke'].includes(action)) return res.status(400).json({ error: '无效操作' });

  db.transaction(() => {
    db.prepare('UPDATE review_appeals SET status = ?, handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(action === 'revoke' ? 'approved' : 'rejected', req.user.id, ra.id);
    if (action === 'revoke') {
      db.prepare('DELETE FROM reviews WHERE id = ?').run(ra.review_id);
    }
  })();
  logAudit(req.user.id, 'process_review_appeal', 'review_appeal', ra.id, { action }, req.ip);
  res.json({ message: action === 'revoke' ? '申诉成立，评价已撤销' : '申诉已维持原评价' });
});

// 平台设置
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings ORDER BY key').all();
  res.json({ items: rows });
});

router.put('/settings', (req, res) => {
  const entries = (req.body && req.body.settings) || {};
  const allowed = ['commission_rate', 'retention_rate', 'warranty_months', 'require_final_acceptance', 'require_both_signatures'];
  for (const [k, v] of Object.entries(entries)) {
    if (!allowed.includes(k)) return res.status(400).json({ error: '不支持的设置项: ' + k });
    if (['commission_rate', 'retention_rate'].includes(k)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 50) return res.status(400).json({ error: k + ' 必须在 0-50 之间' });
    }
    setSetting(k, v);
  }
  logAudit(req.user.id, 'update_settings', 'settings', null, entries, req.ip);
  res.json({ message: '设置已保存' });
});

// 对账报表（CSV 导出）
router.get('/reports/ledger.csv', (req, res) => {
  const start = String(req.query.start || '2000-01-01');
  const end = String(req.query.end || '2999-12-31');
  const rows = db.prepare(`
    SELECT l.id, l.type, l.amount, l.balance_after, u.username, l.ref_type, l.ref_id, l.remark, l.created_at
    FROM ledger l LEFT JOIN users u ON l.user_id = u.id
    WHERE date(l.created_at) BETWEEN date(?) AND date(?)
    ORDER BY l.id ASC
  `).all(start, end);

  const csvLines = [['id', 'type', 'amount', 'balance_after', 'username', 'ref_type', 'ref_id', 'remark', 'created_at'].join(',')]
    .concat(rows.map(r => [r.id, r.type, r.amount, r.balance_after == null ? '' : r.balance_after,
      r.username == null ? '平台' : r.username, r.ref_type == null ? '' : r.ref_type, r.ref_id == null ? '' : r.ref_id,
      '"' + String(r.remark == null ? '' : r.remark).replace(/"/g, '""') + '"', r.created_at].join(',')));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ledger-' + start + '-to-' + end + '.csv"');
  res.send('\ufeff' + csvLines.join('\n'));
});

// 数据库备份
router.get('/backups', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', '..', 'backups');
  const items = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.db')).map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size, created: fs.statSync(path.join(dir, f)).mtime }))
      .sort((a, b) => b.name.localeCompare(a.name))
    : [];
  res.json({ items });
});

router.post('/backups', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name = 'backup-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.db';
  db.backup(path.join(dir, name))
    .then(() => {
      logAudit(req.user.id, 'backup_database', 'backup', null, { file: name }, req.ip);
      res.json({ message: '备份完成', file: name });
    })
    .catch(err => res.status(500).json({ error: '备份失败: ' + err.message }));
});

module.exports = router;
