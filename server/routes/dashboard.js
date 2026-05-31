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

const router = express.Router();

// 甲方专属统计
router.get('/client', authMiddleware, requireRole('user'), (req, res) => {
  const userId = req.user.id;

  const projectsByStatus = db.prepare('SELECT status, COUNT(*) as count FROM projects WHERE user_id = ? GROUP BY status').all(userId);
  const totalSpent = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM contracts WHERE owner_id = ? AND status = 'completed'").get(userId).total;
  const activeContracts = db.prepare("SELECT COUNT(*) as count FROM contracts WHERE owner_id = ? AND status = 'active'").get(userId).count;
  const totalProjects = db.prepare('SELECT COUNT(*) as count FROM projects WHERE user_id = ?').get(userId).count;
  const pendingBids = db.prepare(`SELECT COUNT(*) as count FROM bids b JOIN projects p ON b.project_id = p.id WHERE p.user_id = ? AND b.status = 'pending'`).get(userId).count;
  const recentProjects = db.prepare('SELECT id, title, status, budget, created_at FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(userId);

  // 月度支出趋势
  const monthlySpending = db.prepare(`
    SELECT strftime('%Y-%m', completed_at) as month, SUM(amount) as total
    FROM contracts WHERE owner_id = ? AND status = 'completed'
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all(userId).reverse();

  res.json({ projectsByStatus, totalSpent, activeContracts, totalProjects, pendingBids, recentProjects, monthlySpending });
});

// 工程师专属统计
router.get('/engineer', authMiddleware, requireRole('engineer'), (req, res) => {
  const userId = req.user.id;

  const bidsByStatus = db.prepare('SELECT status, COUNT(*) as count FROM bids WHERE engineer_id = ? GROUP BY status').all(userId);
  const totalEarned = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM contracts WHERE engineer_id = ? AND status = 'completed'").get(userId).total;
  const activeContracts = db.prepare("SELECT COUNT(*) as count FROM contracts WHERE engineer_id = ? AND status = 'active'").get(userId).count;
  const completedProjects = db.prepare("SELECT COUNT(*) as count FROM contracts WHERE engineer_id = ? AND status = 'completed'").get(userId).count;
  const totalBids = db.prepare('SELECT COUNT(*) as count FROM bids WHERE engineer_id = ?').get(userId).count;
  const avgRating = db.prepare('SELECT COALESCE(AVG(rating), 0) as avg FROM reviews WHERE to_user_id = ?').get(userId).avg;
  const recentBids = db.prepare(`SELECT b.id, b.price, b.status, b.created_at, p.title as project_title, p.status as project_status
    FROM bids b JOIN projects p ON b.project_id = p.id WHERE b.engineer_id = ? ORDER BY b.created_at DESC LIMIT 5`).all(userId);

  // 月度收入趋势
  const monthlyEarnings = db.prepare(`
    SELECT strftime('%Y-%m', completed_at) as month, SUM(amount) as total
    FROM contracts WHERE engineer_id = ? AND status = 'completed'
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all(userId).reverse();

  res.json({ bidsByStatus, totalEarned, activeContracts, completedProjects, totalBids, avgRating, recentBids, monthlyEarnings });
});

// 个人数据统计（通用）
router.get('/stats', authMiddleware, (req, res) => {
  const userId = req.user.id;

  const stats = {};

  const myProjects = db.prepare('SELECT status, COUNT(*) as count FROM projects WHERE user_id = ? GROUP BY status').all(userId);
  stats.my_projects = myProjects;

  const myBids = db.prepare('SELECT status, COUNT(*) as count FROM bids WHERE engineer_id = ? GROUP BY status').all(userId);
  stats.my_bids = myBids;

  const myContracts = db.prepare('SELECT status, COUNT(*) as count FROM contracts WHERE owner_id = ? OR engineer_id = ? GROUP BY status').all(userId, userId);
  stats.my_contracts = myContracts;

  const asOwner = db.prepare("SELECT SUM(amount) as total FROM contracts WHERE owner_id = ? AND status = 'completed'").get(userId);
  const asEngineer = db.prepare("SELECT SUM(amount) as total FROM contracts WHERE engineer_id = ? AND status = 'completed'").get(userId);
  stats.total_spent = asOwner.total || 0;
  stats.total_earned = asEngineer.total || 0;

  const reviewStats = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE to_user_id = ?').get(userId);
  stats.avg_rating = reviewStats.avg_rating || 0;
  stats.review_count = reviewStats.count;

  stats.unread_messages = db.prepare('SELECT COUNT(*) as count FROM messages WHERE to_user_id = ? AND is_read = 0').get(userId).count;

  res.json(stats);
});

// 全局统计（未登录用户返回模糊数据，管理员返回完整数据）
router.get('/global', optionalAuth, (req, res) => {
  const total_projects = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
  const total_users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const total_engineers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'engineer' OR certification_status = 'approved'").get().count;
  const total_contracts = db.prepare('SELECT COUNT(*) as count FROM contracts').get().count;
  const total_amount = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM contracts WHERE status = 'completed'").get().total;

  const by_category = db.prepare('SELECT category, COUNT(*) as count FROM projects GROUP BY category ORDER BY count DESC').all();

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
    FROM projects
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all();

  // 判断用户权限
  const isLoggedIn = !!req.user;
  const isAdmin = req.user?.role === 'admin';

  // 管理员返回完整详细数据
  if (isAdmin) {
    const total_clients = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user'").get().count;
    const pending_certs = db.prepare("SELECT COUNT(*) as count FROM users WHERE certification_status = 'pending'").get().count;
    const active_contracts = db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = 'active'").get().count;
    const bidding_projects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'bidding'").get().count;

    res.json({
      total_projects,
      total_users,
      total_engineers,
      total_clients,
      total_contracts,
      total_amount,
      pending_certs,
      active_contracts,
      bidding_projects,
      by_category,
      monthly: monthly.reverse(),
      show_details: true,
      is_admin: true
    });
  } else {
    // 普通登录用户或未登录用户
    res.json({
      total_projects: isLoggedIn ? total_projects : '***',
      total_users: isLoggedIn ? total_users : '***',
      total_engineers: isLoggedIn ? total_engineers : '***',
      total_contracts: isLoggedIn ? total_contracts : '***',
      total_amount: isLoggedIn ? total_amount : '***',
      by_category: isLoggedIn ? by_category : [],
      monthly: isLoggedIn ? monthly.reverse() : [],
      show_details: isLoggedIn,
      is_admin: false
    });
  }
});

module.exports = router;
