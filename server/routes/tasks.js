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
const { authMiddleware } = require('../middleware/auth');
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

// 获取项目所有任务（需登录，避免任务安排与人员信息被匿名抓取）
router.get('/', authMiddleware, checkProjectAccess, (req, res) => {
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
    const { name, description, assignee_id, start_date, end_date, status, progress, priority, sort_order } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '任务名称不能为空' });
    }
    if (String(name).length > 100) {
      return res.status(400).json({ error: '任务名称不能超过100个字符' });
    }
    if (priority && !['low', 'normal', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({ error: '无效的优先级' });
    }
    if (status !== undefined && status !== null && !['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '无效的任务状态' });
    }
    if (start_date && !/^\d{4}-\d{2}-\d{2}/.test(String(start_date))) {
      return res.status(400).json({ error: '开始日期格式不正确' });
    }
    if (end_date && !/^\d{4}-\d{2}-\d{2}/.test(String(end_date))) {
      return res.status(400).json({ error: '截止日期格式不正确' });
    }
    if (start_date && end_date && String(end_date) < String(start_date)) {
      return res.status(400).json({ error: '截止日期不能早于开始日期' });
    }
    let progressNum = 0;
    if (progress !== undefined && progress !== null) {
      progressNum = Number(progress);
      if (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100) {
        return res.status(400).json({ error: '进度值必须在0-100之间' });
      }
      progressNum = Math.round(progressNum);
    }
    const finalStatus = status || 'pending';
    const finalProgress = finalStatus === 'completed' ? 100 : progressNum;

    // 验证指派人是否存在
    if (assignee_id) {
      const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(assignee_id));
      if (!assignee) {
        return res.status(400).json({ error: '指派人不存在' });
      }
    }

    const result = db.prepare(`
      INSERT INTO project_tasks (project_id, name, description, assignee_id, start_date, end_date, status, progress, priority, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.projectId,
      String(name).trim(),
      description || null,
      assignee_id ? Number(assignee_id) : null,
      start_date || null,
      end_date || null,
      finalStatus,
      finalProgress,
      priority || 'normal',
      Math.max(0, Math.floor(Number(sort_order) || 0))
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

// 获取单个任务详情（需登录）
router.get('/:taskId', authMiddleware, checkProjectAccess, (req, res) => {
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

    // 验证输入
    if (name !== undefined && (!String(name).trim() || String(name).length > 100)) {
      return res.status(400).json({ error: '任务名称不能为空且不能超过100个字符' });
    }
    if (status !== undefined && status !== null && !['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '无效的任务状态' });
    }
    if (priority !== undefined && priority !== null && !['low', 'normal', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({ error: '无效的优先级' });
    }
    if (start_date !== undefined && start_date !== null && start_date !== '' && !/^\d{4}-\d{2}-\d{2}/.test(String(start_date))) {
      return res.status(400).json({ error: '开始日期格式不正确' });
    }
    if (end_date !== undefined && end_date !== null && end_date !== '' && !/^\d{4}-\d{2}-\d{2}/.test(String(end_date))) {
      return res.status(400).json({ error: '截止日期格式不正确' });
    }

    // 验证指派人
    let finalAssignee = task.assignee_id;
    if (assignee_id !== undefined) {
      if (assignee_id === null || assignee_id === '') {
        finalAssignee = null; // 允许清空指派人
      } else {
        const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(assignee_id));
        if (!assignee) {
          return res.status(400).json({ error: '指派人不存在' });
        }
        finalAssignee = Number(assignee_id);
      }
    }

    // 验证进度值
    let progressNum = task.progress;
    if (progress !== undefined && progress !== null) {
      progressNum = Number(progress);
      if (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100) {
        return res.status(400).json({ error: '进度值必须在0-100之间' });
      }
      progressNum = Math.round(progressNum);
    }

    // 如果状态改为 completed，自动设置进度为100
    const finalProgress = status === 'completed' ? 100 : progressNum;

    // 日期允许清空（传 '' 或 null 时置为 NULL），并校验先后关系
    const finalStart = start_date !== undefined ? (start_date ? String(start_date) : null) : task.start_date;
    const finalEnd = end_date !== undefined ? (end_date ? String(end_date) : null) : task.end_date;
    if (finalStart && finalEnd && finalEnd < finalStart) {
      return res.status(400).json({ error: '截止日期不能早于开始日期' });
    }

    db.prepare(`
      UPDATE project_tasks SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        assignee_id = ?,
        start_date = ?,
        end_date = ?,
        status = COALESCE(?, status),
        progress = ?,
        priority = COALESCE(?, priority),
        sort_order = COALESCE(?, sort_order),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `).run(
      name !== undefined && String(name).trim() ? String(name).trim() : null,
      description !== undefined && description !== null ? description : null,
      finalAssignee,
      finalStart,
      finalEnd,
      status || null,
      finalProgress,
      priority || null,
      sort_order !== undefined ? Math.max(0, Math.floor(Number(sort_order) || 0)) : task.sort_order,
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

    if (!Array.isArray(tasks) || tasks.some(t => !Number.isFinite(Number(t?.id)))) {
      return res.status(400).json({ error: '无效的任务列表' });
    }

    const updateStmt = db.prepare(
      'UPDATE project_tasks SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
    );

    const updateMany = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(Math.max(0, Math.floor(Number(item.sort_order) || 0)), Number(item.id), req.params.projectId);
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

    if (!Array.isArray(tasks) || tasks.some(t => !Number.isFinite(Number(t?.id)))) {
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
        const progress = item.progress !== undefined && item.progress !== null ? Math.round(Number(item.progress)) : null;
        if (progress !== null && (progress < 0 || progress > 100)) {
          throw new Error('进度值必须在0-100之间');
        }
        const finalStatus = progress === 100 ? 'completed' : (item.status || null);
        updateStmt.run(progress, finalStatus, Number(item.id), req.params.projectId);
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
