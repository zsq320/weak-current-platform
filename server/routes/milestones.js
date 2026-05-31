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
 * 项目里程碑管理路由
 * API 前缀: /api/projects/:projectId/milestones
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
    return res.status(403).json({ error: '只有项目创建者或管理员可以管理里程碑' });
  }

  next();
}

// 获取项目所有里程碑
router.get('/', optionalAuth, checkProjectAccess, (req, res) => {
  try {
    const milestones = db.prepare(`
      SELECT * FROM project_milestones
      WHERE project_id = ?
      ORDER BY sort_order ASC, due_date ASC, created_at ASC
    `).all(req.params.projectId);

    // 计算统计信息和预警
    const now = new Date();
    const stats = {
      total: milestones.length,
      pending: milestones.filter(m => m.status === 'pending').length,
      in_progress: milestones.filter(m => m.status === 'in_progress').length,
      completed: milestones.filter(m => m.status === 'completed').length,
      delayed: milestones.filter(m => {
        if (m.status === 'completed' || !m.due_date) return false;
        return new Date(m.due_date) < now;
      }).length,
      upcoming: milestones.filter(m => {
        if (m.status === 'completed' || !m.due_date) return false;
        const due = new Date(m.due_date);
        const diffDays = (due - now) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 7;
      }).length
    };

    // 添加预警标记
    const milestonesWithAlerts = milestones.map(m => {
      let alert = null;
      if (m.status !== 'completed' && m.due_date) {
        const due = new Date(m.due_date);
        const diffDays = (due - now) / (1000 * 60 * 60 * 24);

        if (diffDays < 0) {
          alert = { type: 'danger', message: `已逾期 ${Math.abs(Math.ceil(diffDays))} 天` };
        } else if (diffDays <= 3) {
          alert = { type: 'warning', message: `还有 ${Math.ceil(diffDays)} 天到期` };
        } else if (diffDays <= 7) {
          alert = { type: 'info', message: `还有 ${Math.ceil(diffDays)} 天到期` };
        }
      }

      return { ...m, alert };
    });

    res.json({ milestones: milestonesWithAlerts, stats });
  } catch (err) {
    console.error('获取里程碑列表失败:', err);
    res.status(500).json({ error: '获取里程碑列表失败' });
  }
});

// 创建里程碑
router.post('/', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const { name, description, due_date, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: '里程碑名称不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO project_milestones (project_id, name, description, due_date, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.params.projectId,
      name,
      description || null,
      due_date || null,
      sort_order || 0
    );

    const milestone = db.prepare('SELECT * FROM project_milestones WHERE id = ?')
      .get(result.lastInsertRowid);

    logAudit(req.user.id, 'create', 'milestone', result.lastInsertRowid, { project_id: req.params.projectId }, req.ip);

    res.status(201).json({ message: '里程碑创建成功', milestone });
  } catch (err) {
    console.error('创建里程碑失败:', err);
    res.status(500).json({ error: '创建里程碑失败' });
  }
});

// 获取单个里程碑详情
router.get('/:milestoneId', optionalAuth, checkProjectAccess, (req, res) => {
  try {
    const milestone = db.prepare('SELECT * FROM project_milestones WHERE id = ? AND project_id = ?')
      .get(req.params.milestoneId, req.params.projectId);

    if (!milestone) {
      return res.status(404).json({ error: '里程碑不存在' });
    }

    res.json(milestone);
  } catch (err) {
    console.error('获取里程碑详情失败:', err);
    res.status(500).json({ error: '获取里程碑详情失败' });
  }
});

// 更新里程碑
router.put('/:milestoneId', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const milestone = db.prepare('SELECT * FROM project_milestones WHERE id = ? AND project_id = ?')
      .get(req.params.milestoneId, req.params.projectId);

    if (!milestone) {
      return res.status(404).json({ error: '里程碑不存在' });
    }

    const { name, description, due_date, status, sort_order } = req.body;

    db.prepare(`
      UPDATE project_milestones SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        due_date = COALESCE(?, due_date),
        status = COALESCE(?, status),
        sort_order = COALESCE(?, sort_order),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `).run(
      name || null,
      description !== undefined ? description : null,
      due_date || null,
      status || null,
      sort_order !== undefined ? sort_order : milestone.sort_order,
      req.params.milestoneId,
      req.params.projectId
    );

    const updatedMilestone = db.prepare('SELECT * FROM project_milestones WHERE id = ?')
      .get(req.params.milestoneId);

    logAudit(req.user.id, 'update', 'milestone', req.params.milestoneId, { status }, req.ip);

    res.json({ message: '里程碑更新成功', milestone: updatedMilestone });
  } catch (err) {
    console.error('更新里程碑失败:', err);
    res.status(500).json({ error: '更新里程碑失败' });
  }
});

// 删除里程碑
router.delete('/:milestoneId', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const milestone = db.prepare('SELECT * FROM project_milestones WHERE id = ? AND project_id = ?')
      .get(req.params.milestoneId, req.params.projectId);

    if (!milestone) {
      return res.status(404).json({ error: '里程碑不存在' });
    }

    db.prepare('DELETE FROM project_milestones WHERE id = ? AND project_id = ?')
      .run(req.params.milestoneId, req.params.projectId);

    logAudit(req.user.id, 'delete', 'milestone', req.params.milestoneId, null, req.ip);

    res.json({ message: '里程碑删除成功' });
  } catch (err) {
    console.error('删除里程碑失败:', err);
    res.status(500).json({ error: '删除里程碑失败' });
  }
});

// 批量更新里程碑顺序
router.put('/batch/reorder', authMiddleware, checkProjectAccess, checkProjectOwner, (req, res) => {
  try {
    const { milestones } = req.body; // [{ id, sort_order }]

    if (!Array.isArray(milestones)) {
      return res.status(400).json({ error: '无效的里程碑列表' });
    }

    const updateStmt = db.prepare(
      'UPDATE project_milestones SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?'
    );

    const updateMany = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(item.sort_order, item.id, req.params.projectId);
      }
    });

    updateMany(milestones);

    res.json({ message: '里程碑顺序更新成功' });
  } catch (err) {
    console.error('批量更新里程碑顺序失败:', err);
    res.status(500).json({ error: '更新里程碑顺序失败' });
  }
});

module.exports = router;
