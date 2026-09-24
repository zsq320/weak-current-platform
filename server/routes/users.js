// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 用户公开主页（工程师信任体系）
 * API 前缀: /api/users
 *
 * 只暴露对建立信任有意义的公开信息（认证状态、企业资质、成交与口碑统计、注册时长），
 * 不返回手机号/邮箱/身份证等任何联系方式或敏感字段。
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

// 公开主页数据（未登录可看）
router.get('/:id/profile', (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: '无效的用户ID' });
  }

  const user = db.prepare(`
    SELECT id, username, role, avatar, certification_status, created_at
    FROM users WHERE id = ? AND is_disabled = 0
  `).get(userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  // 通过企业认证的展示企业名称与资质等级
  const company = db.prepare(`
    SELECT company_name, qualification_level, status FROM companies
    WHERE user_id = ? AND status = 'approved'
  `).get(userId) || null;

  // 成交与口碑统计（以工程师身份）
  const stats = {
    completed_contracts: db.prepare("SELECT COUNT(*) c FROM contracts WHERE engineer_id = ? AND status = 'completed'").get(userId).c,
    active_contracts: db.prepare("SELECT COUNT(*) c FROM contracts WHERE engineer_id = ? AND status = 'active'").get(userId).c,
    total_bids: db.prepare('SELECT COUNT(*) c FROM bids WHERE engineer_id = ?').get(userId).c,
    won_bids: db.prepare("SELECT COUNT(*) c FROM bids WHERE engineer_id = ? AND status = 'accepted'").get(userId).c
  };
  const review = db.prepare('SELECT COALESCE(AVG(rating),0) avg_rating, COUNT(*) c FROM reviews WHERE to_user_id = ?').get(userId);
  stats.avg_rating = Math.round((review.avg_rating || 0) * 10) / 10;
  stats.review_count = review.c;

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    avatar: user.avatar || null,
    certification_status: user.certification_status || 'none',
    company,
    stats,
    member_since: user.created_at
  });
});

module.exports = router;
