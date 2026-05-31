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

// 发送消息
router.post('/', authMiddleware, (req, res) => {
  const { to_user_id, title, content } = req.body;
  if (!to_user_id || !content) return res.status(400).json({ error: '收件人和内容不能为空' });

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(to_user_id));
  if (!targetUser) return res.status(404).json({ error: '用户不存在' });

  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, Number(to_user_id), title || '私信', content, 'system'
  );

  res.json({ message: '发送成功' });
});

// 获取我的消息
router.get('/', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, unread } = req.query;
  let sql = 'SELECT m.*, u.username as from_username FROM messages m LEFT JOIN users u ON m.from_user_id = u.id WHERE m.to_user_id = ?';
  let countSql = 'SELECT COUNT(*) as total FROM messages WHERE to_user_id = ?';
  const params = [req.user.id];
  const countParams = [req.user.id];

  if (unread === 'true') {
    sql += ' AND m.is_read = 0';
    countSql += ' AND is_read = 0';
  }

  sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const total = db.prepare(countSql).get(...countParams).total;
  const messages = db.prepare(sql).all(...params);

  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE to_user_id = ? AND is_read = 0').get(req.user.id).count;

  res.json({ data: messages, total, unreadCount, page: Number(page), pageSize: Number(pageSize) });
});

// 标记已读
router.post('/:id/read', authMiddleware, (req, res) => {
  db.prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND to_user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ message: '已标记已读' });
});

// 全部标记已读
router.post('/read-all', authMiddleware, (req, res) => {
  db.prepare('UPDATE messages SET is_read = 1 WHERE to_user_id = ?').run(req.user.id);
  res.json({ message: '全部已读' });
});

// 删除消息
router.delete('/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ? AND to_user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ message: '已删除' });
});

module.exports = router;
