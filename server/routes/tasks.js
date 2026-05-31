// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

/**
 * 项目任务管理路由
 * API 前缀: /api/projects/:projectId/tasks
 */

const express = require('express');
const db = require('../db');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router({ mergeParams: true });

// 验证项目存在性和权限
function checkProjectAccess(req, res, next) {
  const projectId = req.params.projectId;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }

  req.project = project;
  next();
}

// 检查是否为项目所有者或管理员
function checkProjectOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }

  const isOwner = req.project.user_id === req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: '只有项目创建者或管理员可以管理任务' });
  }

  next();
}

// 获取项目所有任务
router.get('/', optionalAuth, checkProjectAccess, (req, res) => {
  try {
    const tasks = db.prepare(`
      SELECT t.*,
             u.username AS assignee_name,
             u.real_name AS assignee_real_name,
             u.avatar AS assignee_avatar
      FROM project_tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.project_id = ?
      ORDER BY t.sort_order ASC, t.created_at ASC
    `).all(req.params.projectId);

    // 计算统计信息
    const stats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      overdue: tasks.filter(t => {
        if (t.status === 'completed' || !t.end_date) return false;
        return new Date(t.end_date) < new Date();
      }).length,
      overall_progress: tasks.length > 0
        ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length)
        : 0
    };

    res.json({ tasks, stats });
  } catch (err) {
    console.error('获取任务列表失败:', err);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// 创建任务
router.post('/', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const { name, description, assignee_id, start_date, end_date, priority, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: '任务名称不能为空' });
    }

    // 验证指派人是否存在
    if (assignee_id) {
      const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assignee_id);
      if (!assignee) {
        return res.status(400).json({ error: '指派人不存在' });
      }
    }

    const result = db.prepare(`
      INSERT INTO project_tasks (project_id, name, description, assignee_id, start_date, end_date, priority, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.projectId,
      name,
      description || null,
      assignee_id || null,
      start_date || null,
      end_date || null,
      priority || 'normal',
      sort_order || 0
    );

    const task = db.prepare(`
      SELECT t.*,
             u.username AS assignee_name,
             u.real_name AS assignee_real_name
      FROM project_tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    logAudit(req.user.id, 'create', 'task', result.lastInsertRowid, { project_id: req.params.projectId }, req.ip);

    res.status(201).json({ message: '任务创建成功', task });
  } catch (err) {
    console.error('创建任务失败:', err);
    res.status(500).json({ error: '创建任务失败' });
  }
});

// 获取单个任务详情
router.get('/:taskId', optionalAuth, checkProjectAccess, (req, res) => {
  try {
    const task = db.prepare(`
      SELECT t.*,
             u.username AS assignee_name,
             u.real_name AS assignee_real_name,
             u.avatar AS assignee_avatar
      FROM project_tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.id = ? AND t.project_id = ?
    `).get(req.params.taskId, req.params.projectId);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    res.json(task);
  } catch (err) {
    console.error('获取任务详情失败:', err);
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

// 更新任务
router.put('/:taskId', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM project_tasks WHERE id = ? AND project_id = ?')
      .get(req.params.taskId, req.params.projectId);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const { name, description, assignee_id, start_date, end_date, status, progress, priority, sort_order } = req.body;

    // 验证指派人
    if (assignee_id) {
      const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assignee_id);
      if (!assignee) {
        return res.status(400).json({ error: '指派人不存在' });
      }
    }

    // 验证进度值
    if (progress !== undefined && (progress < 0 || progress > 100)) {
      return res.status(400).json({ error: '进度值必须在0-100之间' });
    }

    // 如果状态改为 completed，自动设置进度为100
    const finalProgress = status === 'completed' ? 100 : (progress !== undefined ? progress : task.progress);

    db.prepare(`
      UPDATE project_tasks SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        assignee_id = ?,
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        status = COALESCE(?, status),
        progress = ?,
        priority = COALESCE(?, priority),
        sort_order = COALESCE(?, sort_order),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `).run(
      name || null,
      description !== undefined ? description : null,
      assignee_id !== undefined ? assignee_id : task.assignee_id,
      start_date || null,
      end_date || null,
      status || null,
      finalProgress,
      priority || null,
      sort_order !== undefined ? sort_order : task.sort_order,
      req.params.taskId,
      req.params.projectId
    );

    const updatedTask = db.prepare(`
      SELECT t.*,
             u.username AS assignee_name,
             u.real_name AS assignee_real_name
      FROM project_tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.id = ?
    `).get(req.params.taskId);

    logAudit(req.user.id, 'update', 'task', req.params.taskId, { status, progress: finalProgress }, req.ip);

    res.json({ message: '任务更新成功', task: updatedTask });
  } catch (err) {
    console.error('更新任务失败:', err);
    res.status(500).json({ error: '更新任务失败' });
  }
});

// 删除任务
router.delete('/:taskId', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM project_tasks WHERE id = ? AND project_id = ?')
      .get(req.params.taskId, req.params.projectId);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    db.prepare('DELETE FROM project_tasks WHERE id = ? AND project_id = ?')
      .run(req.params.taskId, req.params.projectId);

    logAudit(req.user.id, 'delete', 'task', req.params.taskId, null, req.ip);

    res.json({ message: '任务删除成功' });
  } catch (err) {
    console.error('删除任务失败:', err);
    res.status(500).json({ error: '删除任务失败' });
  }
});

// 批量更新任务顺序
router.put('/batch/reorder', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const { tasks } = req.body; // [{ id, sort_order }]

    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: '无效的任务列表' });
    }

    const updateStmt = db.prepare(
      'UPDATE project_tasks SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
    );

    const updateMany = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(item.sort_order, item.id, req.params.projectId);
      }
    });

    updateMany(tasks);

    res.json({ message: '任务顺序更新成功' });
  } catch (err) {
    console.error('批量更新任务顺序失败:', err);
    res.status(500).json({ error: '更新任务顺序失败' });
  }
});

// 批量更新任务进度
router.put('/batch/progress', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const { tasks } = req.body; // [{ id, progress, status }]

    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: '无效的任务列表' });
    }

    const updateStmt = db.prepare(`
      UPDATE project_tasks SET
        progress = COALESCE(?, progress),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `);

    const updateMany = db.transaction((items) => {
      for (const item of items) {
        const finalStatus = item.progress === 100 ? 'completed' : item.status;
        updateStmt.run(item.progress, finalStatus, item.id, req.params.projectId);
      }
    });

    updateMany(tasks);

    res.json({ message: '任务进度更新成功' });
  } catch (err) {
    console.error('批量更新任务进度失败:', err);
    res.status(500).json({ error: '更新任务进度失败' });
  }
});

module.exports = router;
