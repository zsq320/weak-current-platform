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
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
  const { username, password, real_name, phone, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, role, real_name, phone, email) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username, password_hash, 'user', real_name, phone, email);

  const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });

  db.prepare('INSERT INTO messages (to_user_id, title, content, type) VALUES (?, ?, ?, ?)').run(
    result.lastInsertRowid, '欢迎加入', '欢迎注册弱电工程管理平台！您可以浏览和发布工程信息。', 'system'
  );

  logAudit(result.lastInsertRowid, 'register', 'user', result.lastInsertRowid, null, req.ip);
  res.json({ token, user: { id: result.lastInsertRowid, username, role: 'user', real_name } });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (user.is_disabled) {
    return res.status(403).json({ error: '账户已被禁用，请联系管理员' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  logAudit(user.id, 'login', 'user', user.id, null, req.ip);

  res.json({
    token,
    user: {
      id: user.id, username: user.username, role: user.role,
      real_name: user.real_name, phone: user.phone, email: user.email,
      certification: user.certification, certification_status: user.certification_status,
      balance: user.balance, avatar: user.avatar
    }
  });
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, role, real_name, phone, email, certification, certification_status, balance, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});

// 更新个人信息
router.put('/profile', authMiddleware, (req, res) => {
  const { real_name, phone, email, avatar } = req.body;
  db.prepare('UPDATE users SET real_name = ?, phone = ?, email = ?, avatar = ? WHERE id = ?')
    .run(real_name, phone, email, avatar, req.user.id);
  res.json({ message: '更新成功' });
});

// 申请工程师认证
router.post('/certify', authMiddleware, (req, res) => {
  const { certification } = req.body;
  if (!certification) return res.status(400).json({ error: '请填写认证信息' });
  db.prepare('UPDATE users SET certification = ?, certification_status = ? WHERE id = ?')
    .run(certification, 'pending', req.user.id);
  res.json({ message: '认证申请已提交' });
});

// 模拟充值
router.post('/deposit', authMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: '充值金额无效' });
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, req.user.id);
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ balance: user.balance, message: `充值 ${amount} 元成功` });
});

module.exports = router;
