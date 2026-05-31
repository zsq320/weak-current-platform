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
 * 投标管理路由
 * 支持：投标提交、评分、筛选、排序、导出
 */

const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole, optionalAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// 投标（支持多字段，需要实名认证）
router.post('/', authMiddleware, requireRole('engineer'), (req, res) => {
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

  const {
    project_id, price, message, duration, duration_unit,
    qualifications, experience_years
  } = req.body;

  if (!project_id || !price) {
    return res.status(400).json({ error: '工程ID和报价不能为空' });
  }

  if (price <= 0) {
    return res.status(400).json({ error: '报价必须大于0' });
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(project_id));
  if (!project) return res.status(404).json({ error: '工程不存在' });
  if (project.status !== 'bidding') return res.status(400).json({ error: '该工程不在招标中' });
  if (project.user_id === req.user.id) return res.status(400).json({ error: '不能对自己的工程投标' });

  const existing = db.prepare('SELECT id FROM bids WHERE project_id = ? AND engineer_id = ?')
    .get(Number(project_id), req.user.id);
  if (existing) return res.status(400).json({ error: '您已对此工程投标' });

  const result = db.prepare(`
    INSERT INTO bids (project_id, engineer_id, price, message, duration, duration_unit, qualifications, experience_years)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(project_id),
    req.user.id,
    price,
    message || null,
    duration || null,
    duration_unit || 'days',
    qualifications || null,
    experience_years || 0
  );

  // 发送通知给项目所有者
  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, project.user_id, '新的投标',
    `用户 ${req.user.username} 对您的工程「${project.title}」投标，报价 ${price} 元`, 'bid'
  );

  logAudit(req.user.id, 'submit_bid', 'bid', result.lastInsertRowid, `project:${project_id},price:${price}`, req.ip);
  res.json({ id: result.lastInsertRowid, message: '投标成功' });
});

// 获取工程的投标列表（支持排序和筛选）
router.get('/project/:projectId', optionalAuth, (req, res) => {
  try {
    const { projectId } = req.params;
    const { sort, order, status, min_price, max_price, keyword } = req.query;

    let sql = `
      SELECT b.*,
             u.username, u.real_name, u.phone, u.avatar,
             u.certification_status,
             (SELECT AVG(rating) FROM reviews WHERE to_user_id = b.engineer_id) as avg_rating,
             (SELECT COUNT(*) FROM reviews WHERE to_user_id = b.engineer_id) as review_count,
             bs.price_score, bs.duration_score, bs.qualification_score, bs.technical_score, bs.total_score
      FROM bids b
      JOIN users u ON b.engineer_id = u.id
      LEFT JOIN bid_scores bs ON b.id = bs.bid_id
      WHERE b.project_id = ?
    `;
    const params = [Number(projectId)];

    // 状态筛选
    if (status && status !== 'all') {
      sql += ' AND b.status = ?';
      params.push(status);
    }

    // 价格范围筛选
    if (min_price) {
      sql += ' AND b.price >= ?';
      params.push(Number(min_price));
    }
    if (max_price) {
      sql += ' AND b.price <= ?';
      params.push(Number(max_price));
    }

    // 关键词搜索
    if (keyword) {
      sql += ' AND (u.username LIKE ? OR u.real_name LIKE ? OR b.message LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // 排序
    const sortField = {
      'price': 'b.price',
      'duration': 'b.duration',
      'created_at': 'b.created_at',
      'total_score': 'COALESCE(bs.total_score, 0)',
      'rating': 'COALESCE(AVG(r.rating), 0)',
      'experience': 'b.experience_years'
    }[sort] || 'b.created_at';

    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    sql += ` GROUP BY b.id ORDER BY ${sortField} ${sortOrder}`;

    const bids = db.prepare(sql).all(...params);

    // 获取工程信息
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(projectId));

    res.json({
      bids,
      project: {
        id: project.id,
        title: project.title,
        budget: project.budget,
        status: project.status
      },
      total: bids.length
    });
  } catch (err) {
    console.error('获取投标列表失败:', err);
    res.status(500).json({ error: '获取投标列表失败' });
  }
});

// 获取单个投标详情
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const bid = db.prepare(`
      SELECT b.*,
             u.username, u.real_name, u.phone, u.email, u.avatar,
             u.certification, u.certification_status, u.balance,
             p.title as project_title, p.budget as project_budget, p.status as project_status,
             bs.price_score, bs.duration_score, bs.qualification_score, bs.technical_score,
             bs.total_score, bs.price_comment, bs.duration_comment,
             bs.qualification_comment, bs.technical_comment,
             scored.username as scored_by_name
      FROM bids b
      JOIN users u ON b.engineer_id = u.id
      JOIN projects p ON b.project_id = p.id
      LEFT JOIN bid_scores bs ON b.id = bs.bid_id
      LEFT JOIN users scored ON bs.scored_by = scored.id
      WHERE b.id = ?
    `).get(Number(req.params.id));

    if (!bid) {
      return res.status(404).json({ error: '投标不存在' });
    }

    res.json(bid);
  } catch (err) {
    console.error('获取投标详情失败:', err);
    res.status(500).json({ error: '获取投标详情失败' });
  }
});

// 接受投标
router.post('/:id/accept', authMiddleware, (req, res) => {
  const bid = db.prepare(`
    SELECT b.*, p.user_id as owner_id, p.title, p.status as project_status
    FROM bids b JOIN projects p ON b.project_id = p.id
    WHERE b.id = ?
  `).get(Number(req.params.id));

  if (!bid) return res.status(404).json({ error: '投标不存在' });
  if (bid.owner_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (bid.project_status !== 'bidding') return res.status(400).json({ error: '工程状态不允许操作' });

  // 开始事务
  const acceptBid = db.transaction(() => {
    db.prepare('UPDATE bids SET status = ? WHERE id = ?').run('accepted', Number(req.params.id));
    db.prepare('UPDATE bids SET status = ? WHERE project_id = ? AND id != ? AND status = ?')
      .run('rejected', bid.project_id, Number(req.params.id), 'pending');
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('in_progress', bid.project_id);
    db.prepare('INSERT INTO contracts (project_id, bid_id, owner_id, engineer_id, amount) VALUES (?, ?, ?, ?, ?)')
      .run(bid.project_id, Number(req.params.id), bid.owner_id, bid.engineer_id, bid.price);

    // 通知中标工程师
    db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, bid.engineer_id, '投标已中标',
      `恭喜！您对工程「${bid.title}」的投标已被接受，报价 ${bid.price} 元。合同已自动生成。`, 'bid'
    );

    // 通知未中标工程师
    const rejectedBids = db.prepare('SELECT engineer_id FROM bids WHERE project_id = ? AND id != ? AND status = ?')
      .all(bid.project_id, Number(req.params.id), 'pending');
    rejectedBids.forEach(b => {
      db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
        req.user.id, b.engineer_id, '投标未中标',
        `您对工程「${bid.title}」的投标未被选中`, 'bid'
      );
    });
  });

  acceptBid();
  logAudit(req.user.id, 'accept_bid', 'bid', Number(req.params.id), null, req.ip);
  res.json({ message: '已接受投标，合同已生成' });
});

// 拒绝投标
router.post('/:id/reject', authMiddleware, (req, res) => {
  const bid = db.prepare(`
    SELECT b.*, p.user_id as owner_id, p.title
    FROM bids b JOIN projects p ON b.project_id = p.id
    WHERE b.id = ?
  `).get(Number(req.params.id));

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
  try {
    const { status, sort, order } = req.query;

    let sql = `
      SELECT b.*,
             p.title as project_title, p.status as project_status,
             p.category, p.budget, p.deadline,
             bs.total_score,
             (SELECT COUNT(*) FROM bids WHERE project_id = b.project_id) as total_bids
      FROM bids b
      JOIN projects p ON b.project_id = p.id
      LEFT JOIN bid_scores bs ON b.id = bs.bid_id
      WHERE b.engineer_id = ?
    `;
    const params = [req.user.id];

    if (status && status !== 'all') {
      sql += ' AND b.status = ?';
      params.push(status);
    }

    const sortField = {
      'created_at': 'b.created_at',
      'price': 'b.price',
      'total_score': 'COALESCE(bs.total_score, 0)'
    }[sort] || 'b.created_at';

    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortField} ${sortOrder}`;

    const bids = db.prepare(sql).all(...params);
    res.json(bids);
  } catch (err) {
    console.error('获取我的投标失败:', err);
    res.status(500).json({ error: '获取投标列表失败' });
  }
});

// ============= 评分相关接口 =============

// 提交投标评分（仅项目所有者和管理员）
router.post('/:id/score', authMiddleware, (req, res) => {
  try {
    const { price_score, duration_score, qualification_score, technical_score,
            price_comment, duration_comment, qualification_comment, technical_comment } = req.body;

    // 验证输入
    const scores = { price_score, duration_score, qualification_score, technical_score };
    for (const [key, value] of Object.entries(scores)) {
      if (value < 0 || value > 25) {
        return res.status(400).json({ error: `${key} 必须在 0-25 之间` });
      }
    }

    const bid = db.prepare(`
      SELECT b.*, p.user_id as owner_id, p.title
      FROM bids b JOIN projects p ON b.project_id = p.id
      WHERE b.id = ?
    `).get(Number(req.params.id));

    if (!bid) return res.status(404).json({ error: '投标不存在' });

    const isOwner = bid.owner_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: '只有项目所有者或管理员可以评分' });
    }

    // 计算总分
    const total_score = price_score + duration_score + qualification_score + technical_score;

    // 保存评分
    const existing = db.prepare('SELECT id FROM bid_scores WHERE bid_id = ?').get(Number(req.params.id));

    if (existing) {
      db.prepare(`
        UPDATE bid_scores SET
          price_score = ?, duration_score = ?, qualification_score = ?, technical_score = ?,
          price_comment = ?, duration_comment = ?, qualification_comment = ?, technical_comment = ?,
          total_score = ?, scored_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE bid_id = ?
      `).run(
        price_score, duration_score, qualification_score, technical_score,
        price_comment, duration_comment, qualification_comment, technical_comment,
        total_score, req.user.id, Number(req.params.id)
      );
    } else {
      db.prepare(`
        INSERT INTO bid_scores (bid_id, project_id, price_score, duration_score, qualification_score, technical_score,
          price_comment, duration_comment, qualification_comment, technical_comment, total_score, scored_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(req.params.id), bid.project_id,
        price_score, duration_score, qualification_score, technical_score,
        price_comment, duration_comment, qualification_comment, technical_comment,
        total_score, req.user.id
      );
    }

    // 更新 bids 表的总分
    db.prepare('UPDATE bids SET total_score = ?, scored_at = CURRENT_TIMESTAMP, scored_by = ? WHERE id = ?')
      .run(total_score, req.user.id, Number(req.params.id));

    // 通知工程师
    db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, bid.engineer_id, '投标已被评分',
      `您对工程「${bid.title}」的投标已收到评分，总分 ${total_score} 分`, 'bid'
    );

    logAudit(req.user.id, 'score_bid', 'bid', Number(req.params.id), { total_score }, req.ip);

    res.json({ message: '评分成功', total_score });
  } catch (err) {
    console.error('评分失败:', err);
    res.status(500).json({ error: '评分失败' });
  }
});

// 获取工程的评分排名
router.get('/project/:projectId/rankings', optionalAuth, (req, res) => {
  try {
    const rankings = db.prepare(`
      SELECT
        b.id, b.price, b.duration, b.experience_years,
        u.username, u.real_name, u.certification_status,
        bs.price_score, bs.duration_score, bs.qualification_score, bs.technical_score,
        bs.total_score, bs.price_comment, bs.duration_comment,
        bs.qualification_comment, bs.technical_comment
      FROM bids b
      JOIN users u ON b.engineer_id = u.id
      JOIN bid_scores bs ON b.id = bs.bid_id
      WHERE b.project_id = ?
      ORDER BY bs.total_score DESC
    `).all(Number(req.params.projectId));

    res.json(rankings);
  } catch (err) {
    console.error('获取评分排名失败:', err);
    res.status(500).json({ error: '获取评分排名失败' });
  }
});

// 导出投标评分表（CSV格式）
router.get('/project/:projectId/export', authMiddleware, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(req.params.projectId));
    if (!project) return res.status(404).json({ error: '工程不存在' });

    const isOwner = project.user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: '无权导出' });
    }

    const bids = db.prepare(`
      SELECT
        b.id as bid_id,
        u.username as 工程师账号,
        u.real_name as 真实姓名,
        b.price as 报价,
        b.duration as 工期,
        b.duration_unit as 工期单位,
        b.experience_years as 工作年限,
        b.status as 投标状态,
        b.created_at as 投标时间,
        COALESCE(bs.price_score, 0) as 价格评分,
        COALESCE(bs.duration_score, 0) as 工期评分,
        COALESCE(bs.qualification_score, 0) as 资质评分,
        COALESCE(bs.technical_score, 0) as 技术评分,
        COALESCE(bs.total_score, 0) as 总分,
        bs.price_comment as 价格评语,
        bs.duration_comment as 工期评语,
        bs.qualification_comment as 资质评语,
        bs.technical_comment as 技术评语
      FROM bids b
      JOIN users u ON b.engineer_id = u.id
      LEFT JOIN bid_scores bs ON b.id = bs.bid_id
      WHERE b.project_id = ?
      ORDER BY COALESCE(bs.total_score, 0) DESC
    `).all(Number(req.params.projectId));

    // 生成 CSV
    if (bids.length === 0) {
      return res.status(404).json({ error: '暂无投标数据' });
    }

    const headers = Object.keys(bids[0]);
    const csvContent = [
      '﻿' + headers.join(','), // BOM for Excel
      ...bids.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=bid_scores_${project.id}_${Date.now()}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error('导出失败:', err);
    res.status(500).json({ error: '导出失败' });
  }
});

module.exports = router;
