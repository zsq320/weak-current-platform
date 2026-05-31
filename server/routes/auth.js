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
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// 配置文件上传
const uploadDir = path.join(__dirname, '../uploads/certifications');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // 允许所有图片格式
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

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
           certification, certification_status, balance, avatar, created_at,
           real_name_verified, verified_at
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

// 申请工程师认证（支持图片上传）
router.post('/certify', authMiddleware, upload.array('images', 10), (req, res) => {
  const { certification } = req.body;
  if (!certification) return res.status(400).json({ error: '请填写认证信息' });

  // 收集上传的图片路径
  let imagePaths = [];
  if (req.files && req.files.length > 0) {
    imagePaths = req.files.map(f => '/uploads/certifications/' + f.filename);
  }

  // 将认证信息和图片路径一起存储
  const certData = JSON.stringify({
    description: certification,
    images: imagePaths
  });

  db.prepare('UPDATE users SET certification = ?, certification_status = ? WHERE id = ?')
    .run(certData, 'pending', req.user.id);
  res.json({ message: '认证申请已提交', images: imagePaths });
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

// 获取实名认证状态
router.get('/verification-status', authMiddleware, (req, res) => {
  const user = db.prepare(`
    SELECT real_name, phone, email, real_name_verified, id_card_verified, verified_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: '用户不存在' });

  const isVerified = user.real_name_verified && user.phone && user.email;

  res.json({
    is_verified: isVerified,
    real_name: user.real_name,
    phone: user.phone,
    phone_verified: !!user.phone,
    email: user.email,
    email_verified: !!user.email,
    real_name_verified: !!user.real_name_verified,
    id_card_verified: !!user.id_card_verified,
    verified_at: user.verified_at,
    message: isVerified ? '已实名认证' : '请完善实名认证信息'
  });
});

// 提交实名认证
router.post('/verify-identity', authMiddleware, (req, res) => {
  const { real_name, id_card } = req.body;

  // 验证输入
  if (!real_name) {
    return res.status(400).json({ error: '请输入真实姓名' });
  }

  if (!id_card) {
    return res.status(400).json({ error: '请输入身份证号' });
  }

  // 验证身份证号格式（18位）
  if (!/^\d{17}[\dXx]$/.test(id_card)) {
    return res.status(400).json({ error: '身份证号格式不正确' });
  }

  // 检查用户是否已实名
  const user = db.prepare('SELECT real_name_verified FROM users WHERE id = ?').get(req.user.id);
  if (user.real_name_verified) {
    return res.status(400).json({ error: '您已完成实名认证' });
  }

  // 加密存储身份证号
  const idCardEncrypted = encryptIdCard(id_card);

  db.prepare(`
    UPDATE users SET
      real_name = ?,
      id_card_encrypted = ?,
      real_name_verified = 1,
      id_card_verified = 1,
      verified_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(real_name, idCardEncrypted, req.user.id);

  logAudit(req.user.id, 'verify_identity', 'user', req.user.id, { real_name }, req.ip);

  res.json({ message: '实名认证成功' });
});

// 检查是否可以发布工程（需要实名认证）
router.get('/can-publish', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT real_name, phone, email, real_name_verified FROM users WHERE id = ?').get(req.user.id);

  const isVerified = user.real_name && user.phone && user.email && user.real_name_verified;

  res.json({
    can_publish: isVerified,
    is_verified: isVerified,
    missing_fields: {
      real_name: !user.real_name,
      phone: !user.phone,
      email: !user.email,
      real_name_verified: !user.real_name_verified
    },
    message: isVerified ? '可以发布工程' : '请先完成实名认证'
  });
});

// 检查是否可以投标（需要实名认证）
router.get('/can-bid', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT real_name, phone, email, real_name_verified FROM users WHERE id = ?').get(req.user.id);

  const isVerified = user.real_name && user.phone && user.email && user.real_name_verified;

  res.json({
    can_bid: isVerified,
    is_verified: isVerified,
    missing_fields: {
      real_name: !user.real_name,
      phone: !user.phone,
      email: !user.email,
      real_name_verified: !user.real_name_verified
    },
    message: isVerified ? '可以投标' : '请先完成实名认证'
  });
});

// 发送验证码（用于修改密码）
router.post('/send-verify-code', authMiddleware, (req, res) => {
  const { type } = req.body; // type: 'phone' 或 'email'

  const user = db.prepare('SELECT phone, email FROM users WHERE id = ?').get(req.user.id);

  if (type === 'phone') {
    if (!user.phone) return res.status(400).json({ error: '未绑定手机号' });
    // 生成6位验证码
    const code = Math.random().toString().slice(2, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分钟过期

    db.prepare(`
      INSERT INTO verification_codes (code, type, target, expires_at, used)
      VALUES (?, ?, ?, ?, 0)
    `).run(code, 'phone', user.phone, expiresAt);

    // TODO: 实际发送短信
    console.log(`[验证码] 手机号 ${user.phone} 的验证码是: ${code}`);

    res.json({ message: '验证码已发送', code }); // 开发环境返回验证码
  } else if (type === 'email') {
    if (!user.email) return res.status(400).json({ error: '未绑定邮箱' });
    const code = Math.random().toString().slice(2, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO verification_codes (code, type, target, expires_at, used)
      VALUES (?, ?, ?, ?, 0)
    `).run(code, 'email', user.email, expiresAt);

    // TODO: 实际发送邮件
    console.log(`[验证码] 邮箱 ${user.email} 的验证码是: ${code}`);

    res.json({ message: '验证码已发送', code }); // 开发环境返回验证码
  } else {
    res.status(400).json({ error: '无效的验证类型' });
  }
});

// 修改密码（通过验证码验证）
router.post('/change-password', authMiddleware, (req, res) => {
  const { verification_type, verification_code, new_password } = req.body;

  if (!verification_type || !verification_code || !new_password) {
    return res.status(400).json({ error: '请填写完整信息' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: '密码长度至少6位' });
  }

  const user = db.prepare('SELECT phone, email FROM users WHERE id = ?').get(req.user.id);

  // 获取目标（手机号或邮箱）
  const target = verification_type === 'phone' ? user.phone : user.email;
  if (!target) {
    return res.status(400).json({ error: verification_type === 'phone' ? '未绑定手机号' : '未绑定邮箱' });
  }

  // 验证验证码
  const codeRecord = db.prepare(`
    SELECT id FROM verification_codes
    WHERE code = ? AND type = ? AND target = ? AND used = 0 AND expires_at > datetime('now')
    ORDER BY id DESC LIMIT 1
  `).get(verification_code, verification_type, target);

  if (!codeRecord) {
    return res.status(400).json({ error: '验证码错误或已过期' });
  }

  // 标记验证码已使用
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(codeRecord.id);

  // 更新密码
  const password_hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.user.id);

  logAudit(req.user.id, 'change_password', 'user', req.user.id, null, req.ip);

  res.json({ message: '密码修改成功' });
});

// 头像上传配置
const avatarUploadDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    // 允许所有图片格式
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

// 上传头像
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择要上传的图片' });
  }

  const avatarPath = '/uploads/avatars/' + req.file.filename;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarPath, req.user.id);

  res.json({ message: '头像上传成功', avatar: avatarPath });
});

module.exports = router;
