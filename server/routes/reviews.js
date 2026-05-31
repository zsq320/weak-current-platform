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

const router = express.Router();

// 发表评价
router.post('/', authMiddleware, (req, res) => {
  const { contract_id, rating, comment } = req.body;
  if (!contract_id || !rating) return res.status(400).json({ error: '合同ID和评分不能为空' });

  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(Number(contract_id));
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  if (contract.status !== 'completed') return res.status(400).json({ error: '只能评价已完成的合同' });

  let to_user_id;
  if (req.user.id === contract.owner_id) {
    to_user_id = contract.engineer_id;
  } else if (req.user.id === contract.engineer_id) {
    to_user_id = contract.owner_id;
  } else {
    return res.status(403).json({ error: '无权评价此合同' });
  }

  const existing = db.prepare('SELECT id FROM reviews WHERE contract_id = ? AND from_user_id = ?').get(Number(contract_id), req.user.id);
  if (existing) return res.status(400).json({ error: '您已评价过此合同' });

  const result = db.prepare('INSERT INTO reviews (contract_id, from_user_id, to_user_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
    .run(Number(contract_id), req.user.id, to_user_id, rating, comment);

  const project = db.prepare('SELECT title FROM projects WHERE id = ?').get(contract.project_id);
  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, to_user_id, '收到新评价',
    `您在工程「${project.title}」中收到一条 ${rating} 星评价`, 'system'
  );

  res.json({ id: result.lastInsertRowid, message: '评价成功' });
});

// 获取用户收到的评价
router.get('/user/:userId', (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, u.username as from_username, u.real_name as from_real_name,
      p.title as project_title
    FROM reviews r
    JOIN users u ON r.from_user_id = u.id
    JOIN contracts c ON r.contract_id = c.id
    JOIN projects p ON c.project_id = p.id
    WHERE r.to_user_id = ?
    ORDER BY r.created_at DESC
  `).all(Number(req.params.userId));

  const avg = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE to_user_id = ?').get(Number(req.params.userId));

  res.json({ reviews, avg_rating: avg.avg_rating || 0, total: avg.count });
});

// 获取合同的评价
router.get('/contract/:contractId', (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, u.username as from_username, u.real_name as from_real_name
    FROM reviews r JOIN users u ON r.from_user_id = u.id
    WHERE r.contract_id = ?
  `).all(Number(req.params.contractId));
  res.json(reviews);
});

module.exports = router;
