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
const db = require('../db');
const {
  authMiddleware,
  logout,
  generateTokenPair,
  refreshAccessToken
} = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { validateRegister, validatePhoneLogin } = require('../middleware/validation');
const {
  sanitizeUser,
  encryptIdCard,
  decryptIdCard,
  encryptBankCard,
  decryptBankCard
} = require('../utils/encryption');

const router = express.Router();

// 手机号正则
const PHONE_REGEX = /^1[3-9]\d{9}$/;
// 邮箱正则
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 注册（需要验证手机号和邮箱）
router.post('/register', validateRegister, (req, res) => {
  const { username, password, real_name, phone, email, phone_code, email_code } = req.body;

  // 验证手机号验证码
  const phoneVerification = db.prepare(`
    SELECT * FROM verification_codes
    WHERE target = ? AND type = 'phone' AND purpose = 'register' AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(phone);

  if (!phoneVerification || phoneVerification.code !== phone_code) {
    return res.status(400).json({ error: '手机验证码错误' });
  }
  if (new Date(phoneVerification.expires_at) < new Date()) {
    return res.status(400).json({ error: '手机验证码已过期' });
  }

  // 验证邮箱验证码
  const emailVerification = db.prepare(`
    SELECT * FROM verification_codes
    WHERE target = ? AND type = 'email' AND purpose = 'register' AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(email);

  if (!emailVerification || emailVerification.code !== email_code) {
    return res.status(400).json({ error: '邮箱验证码错误' });
  }
  if (new Date(emailVerification.expires_at) < new Date()) {
    return res.status(400).json({ error: '邮箱验证码已过期' });
  }

  // 检查用户名是否存在
  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUsername) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  // 检查手机号是否存在
  const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existingPhone) {
    return res.status(400).json({ error: '该手机号已被注册' });
  }

  // 检查邮箱是否存在
  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingEmail) {
    return res.status(400).json({ error: '该邮箱已被注册' });
  }

  // 创建用户
  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role, real_name, phone, email, phone_verified, email_verified)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
  `).run(username, password_hash, 'user', real_name, phone, email);

  // 标记验证码已使用
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(phoneVerification.id);
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(emailVerification.id);

  // 生成令牌对（访问令牌 + 刷新令牌）
  const newUser = { id: result.lastInsertRowid, username, role: 'user' };
  const { accessToken, refreshToken } = generateTokenPair(newUser);

  // 发送欢迎消息
  db.prepare('INSERT INTO messages (to_user_id, title, content, type) VALUES (?, ?, ?, ?)').run(
    result.lastInsertRowid,
    '欢迎加入',
    '欢迎注册弱电工程管理平台！您可以浏览和发布工程信息。',
    'system'
  );

  logAudit(result.lastInsertRowid, 'register', 'user', result.lastInsertRowid, null, req.ip);

  res.json({
    accessToken,
    refreshToken,
    user: sanitizeUser({
      id: result.lastInsertRowid,
      username,
      role: 'user',
      real_name,
      phone,
      email
    })
  });
});

// 账号密码登录
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

  // 生成令牌对
  const { accessToken, refreshToken } = generateTokenPair(user);

  logAudit(user.id, 'login', 'user', user.id, null, req.ip);

  res.json({
    accessToken,
    refreshToken,
    user: sanitizeUser(user)
  });
});

// 手机号+验证码登录
router.post('/login/phone', validatePhoneLogin, (req, res) => {
  const { phone, code } = req.body;

  // 查找验证码
  const verification = db.prepare(`
    SELECT * FROM verification_codes
    WHERE target = ? AND type = 'phone' AND purpose = 'login' AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(phone);

  if (!verification || verification.code !== code) {
    return res.status(400).json({ error: '验证码错误' });
  }
  if (new Date(verification.expires_at) < new Date()) {
    return res.status(400).json({ error: '验证码已过期' });
  }

  // 查找用户
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    return res.status(404).json({ error: '该手机号未注册' });
  }
  if (user.is_disabled) {
    return res.status(403).json({ error: '账户已被禁用，请联系管理员' });
  }

  // 标记验证码已使用
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(verification.id);

  // 生成令牌对
  const { accessToken, refreshToken } = generateTokenPair(user);

  logAudit(user.id, 'login_phone', 'user', user.id, null, req.ip);

  res.json({
    accessToken,
    refreshToken,
    user: sanitizeUser(user)
  });
});

// 刷新访问令牌
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: '缺少刷新令牌' });
  }

  try {
    const tokens = refreshAccessToken(refreshToken);
    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
});

// 登出（使令牌失效）
router.post('/logout', logout, (req, res) => {
  logAudit(req.user?.id, 'logout', 'user', req.user?.id, null, req.ip);
  res.json({ message: '登出成功' });
});

// 获取当前用户信息（脱敏）
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, role, real_name, phone, email, phone_verified, email_verified,
           certification, certification_status, balance, avatar, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: '用户不存在' });

  // 返回脱敏后的用户信息
  res.json(sanitizeUser(user));
});

// 更新个人信息
router.put('/profile', authMiddleware, (req, res) => {
  const { real_name, phone, email, avatar } = req.body;

  // 验证输入
  if (phone && !PHONE_REGEX.test(phone)) {
    return res.status(400).json({ error: '手机号格式不正确' });
  }
  if (email && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }

  // 检查手机号是否被其他用户使用
  if (phone) {
    const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone, req.user.id);
    if (existingPhone) {
      return res.status(400).json({ error: '该手机号已被其他用户使用' });
    }
  }

  // 检查邮箱是否被其他用户使用
  if (email) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
    if (existingEmail) {
      return res.status(400).json({ error: '该邮箱已被其他用户使用' });
    }
  }

  db.prepare('UPDATE users SET real_name = ?, phone = ?, email = ?, avatar = ? WHERE id = ?')
    .run(real_name, phone, email, avatar, req.user.id);

  res.json({ message: '更新成功' });
});

// 保存敏感信息（加密存储）
router.post('/sensitive', authMiddleware, (req, res) => {
  const { id_card, bank_card } = req.body;

  const updates = [];
  const params = [];

  if (id_card) {
    // 验证身份证号格式（简单验证）
    if (!/^\d{17}[\dXx]$/.test(id_card)) {
      return res.status(400).json({ error: '身份证号格式不正确' });
    }
    updates.push('id_card_encrypted = ?');
    params.push(encryptIdCard(id_card));
  }

  if (bank_card) {
    // 验证银行卡号格式（16-19位数字）
    if (!/^\d{16,19}$/.test(bank_card)) {
      return res.status(400).json({ error: '银行卡号格式不正确' });
    }
    updates.push('bank_card_encrypted = ?');
    params.push(encryptBankCard(bank_card));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: '没有需要保存的敏感信息' });
  }

  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  res.json({ message: '敏感信息已安全保存' });
});

// 获取敏感信息（解密，需验证身份）
router.get('/sensitive', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id_card_encrypted, bank_card_encrypted FROM users WHERE id = ?').get(req.user.id);

  const result = {
    id_card: user?.id_card_encrypted ? decryptIdCard(user.id_card_encrypted) : null,
    bank_card: user?.bank_card_encrypted ? decryptBankCard(user.bank_card_encrypted) : null
  };

  // 返回脱敏版本
  res.json({
    id_card: result.id_card ? result.id_card.slice(0, 6) + '********' + result.id_card.slice(-4) : null,
    bank_card: result.bank_card ? '****' + result.bank_card.slice(-4) : null
  });
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
  if (amount > 100000) return res.status(400).json({ error: '单次充值金额不能超过10万元' });

  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, req.user.id);
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ balance: user.balance, message: `充值 ${amount} 元成功` });
});

module.exports = router;
