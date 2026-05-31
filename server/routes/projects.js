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

const router = express.Router();

// 获取工程列表
router.get('/', optionalAuth, (req, res) => {
  const { keyword, category, status, user_id, page = 1, pageSize = 10 } = req.query;
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

  res.json({ data: projects, total, page: Number(page), pageSize: Number(pageSize) });
});

// 获取工程详情
router.get('/:id', optionalAuth, (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.username as publisher, u.real_name as publisher_name, u.phone as publisher_phone
    FROM projects p JOIN users u ON p.user_id = u.id WHERE p.id = ?
  `).get(Number(req.params.id));

  if (!project) return res.status(404).json({ error: '工程不存在' });

  const bids = db.prepare(`
    SELECT b.*, u.username as engineer_name, u.real_name as engineer_real_name
    FROM bids b JOIN users u ON b.engineer_id = u.id WHERE b.project_id = ? ORDER BY b.created_at DESC
  `).all(Number(req.params.id));

  project.bids = bids;
  res.json(project);
});

// 发布工程
router.post('/', authMiddleware, requireRole('user'), (req, res) => {
  const { title, description, category, location, budget, deadline } = req.body;
  if (!title || !category) {
    return res.status(400).json({ error: '标题和分类不能为空' });
  }

  const result = db.prepare(
    'INSERT INTO projects (user_id, title, description, category, location, budget, deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, title, description, category, location, budget, deadline, 'bidding');

  logAudit(req.user.id, 'publish_project', 'project', result.lastInsertRowid, title, req.ip);
  res.json({ id: result.lastInsertRowid, message: '工程发布成功' });
});

// 更新工程
router.put('/:id', authMiddleware, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(req.params.id));
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

    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, Number(req.params.id));
    logAudit(req.user.id, 'update_project_status', 'project', project.id, { from: project.status, to: status }, req.ip);
  }

  // 更新其他字段（仅在 pending/bidding 状态下允许）
  if (project.status === 'pending' || project.status === 'bidding') {
    if (title || description !== undefined || category || location || budget !== undefined || deadline) {
      db.prepare('UPDATE projects SET title=COALESCE(?,title), description=COALESCE(?,description), category=COALESCE(?,category), location=COALESCE(?,location), budget=COALESCE(?,budget), deadline=COALESCE(?,deadline) WHERE id=?')
        .run(title || null, description, category || null, location || null, budget, deadline || null, Number(req.params.id));
    }
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

// 删除工程
router.delete('/:id', authMiddleware, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(req.params.id));
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (project.user_id !== req.user.id) return res.status(403).json({ error: '无权删除' });
  if (project.status === 'in_progress') return res.status(400).json({ error: '工程进行中，无法删除' });

  db.prepare('DELETE FROM bids WHERE project_id = ?').run(Number(req.params.id));
  db.prepare('DELETE FROM projects WHERE id = ?').run(Number(req.params.id));
  res.json({ message: '工程已删除' });
});

module.exports = router;
