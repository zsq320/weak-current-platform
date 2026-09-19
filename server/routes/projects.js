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
const { authMiddleware, optionalAuth, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { maskPhone } = require('../utils/encryption');

const router = express.Router();

// 分页参数安全解析
function parsePagination(query) {
  let page = Math.max(1, Math.floor(Number(query.page) || 1));
  let pageSize = Math.floor(Number(query.pageSize) || 10);
  pageSize = Math.min(Math.max(1, pageSize), 100);
  return { page, pageSize };
}

// 获取工程列表
router.get('/', optionalAuth, (req, res) => {
  const { keyword, category, status, user_id } = req.query;
  const { page, pageSize } = parsePagination(req.query);
  let sql = 'SELECT p.*, u.username as publisher, u.real_name as publisher_name FROM projects p JOIN users u ON p.user_id = u.id WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as total FROM projects p WHERE 1=1';
  const params = [];
  const countParams = [];

  if (user_id) {
    sql += ' AND p.user_id = ?';
    countSql += ' AND p.user_id = ?';
    params.push(Number(user_id));
    countParams.push(Number(user_id));
  }
  if (keyword) {
    sql += ' AND (p.title LIKE ? OR p.description LIKE ?)';
    countSql += ' AND (p.title LIKE ? OR p.description LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
    countParams.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (category) {
    sql += ' AND p.category = ?';
    countSql += ' AND p.category = ?';
    params.push(category);
    countParams.push(category);
  }
  if (status) {
    sql += ' AND p.status = ?';
    countSql += ' AND p.status = ?';
    params.push(status);
    countParams.push(status);
  }

  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const total = db.prepare(countSql).get(...countParams).total;
  const projects = db.prepare(sql).all(...params);

  const bidCountStmt = db.prepare('SELECT COUNT(*) as count FROM bids WHERE project_id = ?');
  projects.forEach(p => {
    p.bid_count = bidCountStmt.get(p.id).count;
  });

  res.json({ data: projects, total, page, pageSize });
});

// 获取工程详情（投标列表与发布者手机号仅对项目所有者/管理员可见，防止信息泄露）
router.get('/:id', optionalAuth, (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ error: '无效的工程ID' });
  }

  const project = db.prepare(`
    SELECT p.*, u.username as publisher, u.real_name as publisher_name, u.phone as publisher_phone
    FROM projects p JOIN users u ON p.user_id = u.id WHERE p.id = ?
  `).get(projectId);

  if (!project) return res.status(404).json({ error: '工程不存在' });

  const isOwner = req.user && req.user.id === project.user_id;
  const isAdmin = req.user && req.user.role === 'admin';

  // 发布者联系方式：所有者/管理员可见完整号码，其他人脱敏
  if (!isOwner && !isAdmin) {
    project.publisher_phone = project.publisher_phone ? maskPhone(project.publisher_phone) : null;
  }

  const bidCount = db.prepare('SELECT COUNT(*) as count FROM bids WHERE project_id = ?').get(projectId).count;
  project.bid_count = bidCount;

  // 投标列表仅项目所有者和管理员可见
  if (isOwner || isAdmin) {
    const bids = db.prepare(`
      SELECT b.*, u.username, u.real_name, u.username as engineer_name, u.real_name as engineer_real_name
      FROM bids b JOIN users u ON b.engineer_id = u.id WHERE b.project_id = ? ORDER BY b.created_at DESC
    `).all(projectId);
    project.bids = bids;
  }

  // 当前登录工程师是否已投标（用于前端控制重复投标）
  if (req.user && req.user.role === 'engineer') {
    project.has_bid = !!db.prepare('SELECT id FROM bids WHERE project_id = ? AND engineer_id = ?').get(projectId, req.user.id);
  }

  res.json(project);
});

// 发布工程（需要实名认证）
router.post('/', authMiddleware, requireRole('user'), (req, res) => {
  // 检查实名认证
  const user = db.prepare('SELECT real_name, phone, email, real_name_verified FROM users WHERE id = ?').get(req.user.id);
  const isVerified = user.real_name && user.phone && user.email && user.real_name_verified;
  if (!isVerified) {
    return res.status(403).json({
      error: '请先完成实名认证',
      code: 'REAL_NAME_VERIFICATION_REQUIRED',
      verification_url: '/profile'
    });
  }

  const { title, description, category, location, budget, deadline } = req.body;
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: '标题不能为空' });
  }
  if (!category) {
    return res.status(400).json({ error: '分类不能为空' });
  }
  if (String(title).trim().length > 100) {
    return res.status(400).json({ error: '标题不能超过100个字符' });
  }
  if (budget !== undefined && budget !== null && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) {
    return res.status(400).json({ error: '预算金额不合法' });
  }
  if (deadline && !/^\d{4}-\d{2}-\d{2}/.test(String(deadline))) {
    return res.status(400).json({ error: '截止日期格式不正确' });
  }

  const result = db.prepare(
    'INSERT INTO projects (user_id, title, description, category, location, budget, deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, String(title).trim(), description, category, location, budget !== undefined && budget !== null ? Number(budget) : null, deadline || null, 'bidding');

  logAudit(req.user.id, 'publish_project', 'project', result.lastInsertRowid, title, req.ip);
  res.json({ id: result.lastInsertRowid, message: '工程发布成功' });
});

// 更新工程
router.put('/:id', authMiddleware, (req, res) => {
  const projectId = Number(req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: '工程不存在' });

  const isOwner = project.user_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: '无权修改此工程' });

  const { title, description, category, location, budget, deadline, status } = req.body;

  // 如果有状态更新，验证状态转换
  if (status && status !== project.status) {
    const validTransitions = {
      'bidding': ['in_progress', 'cancelled'],
      'in_progress': ['completed', 'cancelled'],
      'pending': ['bidding', 'cancelled']
    };
    const allowed = validTransitions[project.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `无法从"${project.status}"状态转换到"${status}"状态` });
    }

    // 招标中 → 进行中：必须先处理完所有待定投标（避免遗漏投标无从处理）
    if (project.status === 'bidding' && status === 'in_progress') {
      const pendingCount = db.prepare("SELECT COUNT(*) as count FROM bids WHERE project_id = ? AND status = 'pending'").get(projectId).count;
      if (pendingCount > 0) {
        return res.status(400).json({ error: `还有 ${pendingCount} 个待定投标，请先接受或拒绝后再开始工程` });
      }
    }

    // 进行中 → 已完成：存在履行中合同时必须通过合同结算完成，防止绕过资金结算
    if (project.status === 'in_progress' && status === 'completed') {
      const activeContract = db.prepare("SELECT id FROM contracts WHERE project_id = ? AND status = 'active'").get(projectId);
      if (activeContract) {
        return res.status(400).json({ error: '该工程存在履行中的合同，请在合同管理中确认完工以完成结算' });
      }
    }

    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, projectId);
    logAudit(req.user.id, 'update_project_status', 'project', project.id, { from: project.status, to: status }, req.ip);
  }

  // 更新其他字段（仅在 pending/bidding 状态下允许；null-safe 绑定避免 undefined 导致 500）
  if (project.status === 'pending' || project.status === 'bidding') {
    if (title !== undefined || description !== undefined || category !== undefined || location !== undefined || budget !== undefined || deadline !== undefined) {
      if (budget !== undefined && budget !== null && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) {
        return res.status(400).json({ error: '预算金额不合法' });
      }
      if (title !== undefined && title !== null && !String(title).trim()) {
        return res.status(400).json({ error: '标题不能为空' });
      }
      if (category !== undefined && category !== null && !String(category).trim()) {
        return res.status(400).json({ error: '分类不能为空' });
      }
      db.prepare('UPDATE projects SET title=COALESCE(?,title), description=COALESCE(?,description), category=COALESCE(?,category), location=COALESCE(?,location), budget=COALESCE(?,budget), deadline=COALESCE(?,deadline) WHERE id=?')
        .run(
          title !== undefined && title !== null && String(title).trim() ? String(title).trim() : null,
          description !== undefined && description !== null && String(description).trim() !== '' ? description : null,
          category !== undefined && category !== null && String(category).trim() ? String(category).trim() : null,
          location !== undefined ? location : null,
          budget !== undefined && budget !== null ? Number(budget) : null,
          deadline !== undefined && deadline !== null ? deadline : null,
          projectId
        );
    }
  } else if (description !== undefined && description !== null && String(description).trim() !== '') {
    // 进行中/已完成的工程仍允许发布者补充和修正工程描述
    db.prepare('UPDATE projects SET description = ? WHERE id = ?').run(description, projectId);
  }

  res.json({ message: '工程更新成功' });
});

// 取消工程
router.post('/:id/cancel', authMiddleware, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(req.params.id));
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (project.user_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (project.status === 'in_progress') return res.status(400).json({ error: '工程进行中，无法取消' });

  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('cancelled', Number(req.params.id));
  db.prepare('UPDATE bids SET status = ? WHERE project_id = ? AND status = ?').run('rejected', Number(req.params.id), 'pending');

  res.json({ message: '工程已取消' });
});

// 删除工程（存在合同时禁止删除，保护财务记录完整性）
router.delete('/:id', authMiddleware, (req, res) => {
  const projectId = Number(req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: '工程不存在' });

  const isOwner = project.user_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: '无权删除' });
  if (project.status === 'in_progress') return res.status(400).json({ error: '工程进行中，无法删除' });

  const contractCount = db.prepare('SELECT COUNT(*) as count FROM contracts WHERE project_id = ?').get(projectId).count;
  if (contractCount > 0) {
    return res.status(400).json({ error: '该工程存在关联合同记录，为保护财务数据完整性无法删除' });
  }

  const disputeCount = db.prepare('SELECT COUNT(*) as count FROM disputes WHERE project_id = ?').get(projectId).count;
  if (disputeCount > 0) {
    return res.status(400).json({ error: '该工程存在纠纷/投诉记录，须先办结纠纷再删除' });
  }

  const deleteAll = db.transaction(() => {
    db.prepare('DELETE FROM bid_scores WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM bids WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_tasks WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_milestones WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  });
  deleteAll();

  logAudit(req.user.id, 'delete_project', 'project', projectId, project.title, req.ip);
  res.json({ message: '工程已删除' });
});

module.exports = router;
