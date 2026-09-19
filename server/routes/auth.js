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
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const {
  authMiddleware,
  logout,
  generateTokenPair,
  refreshAccessToken,
  blacklistToken,
  REFRESH_SECRET
} = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { validateIdCard } = require('../utils/idcard');
const { postLedger } = require('../utils/ledger');
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
    // 仅允许常见位图格式（拒绝 SVG 等，防止存储型 XSS）
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传 JPG/PNG/WebP/GIF 图片'));
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
  const { username, password, real_name, phone, email, phone_code, email_code, role, accept_agreement } = req.body;

  // 必须勾选用户协议与隐私政策
  if (!accept_agreement) {
    return res.status(400).json({ error: '请阅读并同意《用户协议》和《隐私政策》' });
  }

  // 角色只允许甲方/工程师（管理员仅能由后台授予）
  const registerRole = ['user', 'engineer'].includes(role) ? role : 'user';

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
  `).run(username, password_hash, registerRole, real_name, phone, email);

  // 标记验证码已使用
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(phoneVerification.id);
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(emailVerification.id);

  // 生成令牌对（访问令牌 + 刷新令牌）
  const newUser = { id: result.lastInsertRowid, username, role: registerRole };
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
      role: registerRole,
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

// 登出（使令牌失效；同时拉黑请求体中的刷新令牌）
router.post('/logout', logout, (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
      if (decoded.jti && decoded.exp) {
        blacklistToken(decoded.jti, 'refresh', new Date(decoded.exp * 1000).toISOString());
      }
    } catch (err) {
      // 无效刷新令牌直接忽略
    }
  }
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

  // 脱敏值（含 * 号）是客户端回显的展示值，直接忽略，防止覆盖真实数据
  const isMasked = (v) => typeof v === 'string' && v.includes('*');
  const cleanPhone = isMasked(phone) ? null : phone;
  const cleanEmail = isMasked(email) ? null : email;

  // 验证输入
  if (cleanPhone && !PHONE_REGEX.test(cleanPhone)) {
    return res.status(400).json({ error: '手机号格式不正确' });
  }
  if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }

  // 检查手机号是否被其他用户使用
  if (cleanPhone) {
    const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(cleanPhone, req.user.id);
    if (existingPhone) {
      return res.status(400).json({ error: '该手机号已被其他用户使用' });
    }
  }

  // 检查邮箱是否被其他用户使用
  if (cleanEmail) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, req.user.id);
    if (existingEmail) {
      return res.status(400).json({ error: '该邮箱已被其他用户使用' });
    }
  }

  db.prepare('UPDATE users SET real_name = COALESCE(?, real_name), phone = COALESCE(?, phone), email = COALESCE(?, email), avatar = COALESCE(?, avatar) WHERE id = ?')
    .run(real_name !== undefined && real_name !== null ? real_name : null, cleanPhone, cleanEmail, avatar || null, req.user.id);

  res.json({ message: '更新成功' });
});

// 保存敏感信息（加密存储）
router.post('/sensitive', authMiddleware, (req, res) => {
  const { id_card, bank_card } = req.body;

  const updates = [];
  const params = [];
  let idChecksumValid = null;

  if (id_card) {
    // 本地格式 + GB11643 校验位核验；真实姓名-身份证二要素核验需对接公安授权服务（见 docs/COMMERCIAL.md）
    if (!/^[0-9]{17}[0-9Xx]$/.test(String(id_card))) {
      return res.status(400).json({ error: '身份证号格式不正确' });
    }
    const check = validateIdCard(id_card);
    idChecksumValid = check.valid ? 1 : 0;
    updates.push('id_card_encrypted = ?, id_checksum_valid = ?');
    params.push(encryptIdCard(id_card), idChecksumValid);
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

  const hint = idChecksumValid === 0
    ? '（提示：身份证校验位未通过，请核对号码，否则后续实名核验无法通过）'
    : '';
  res.json({ message: '敏感信息已安全保存' + hint });
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

// 充值（兼容旧接口：立即入账；内部走充值订单 + 资金账本，保证流水留痕）
// 未配置真实支付网关时使用 mock 测试通道；上线收款须配置网关回调，见 docs/COMMERCIAL.md
router.post('/deposit', authMiddleware, (req, res) => {
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: '充值金额无效' });
  if (amount > 100000) return res.status(400).json({ error: '单次充值金额不能超过10万元' });

  const crypto = require('crypto');
  const orderNo = 'D' + new Date().toISOString().replace(/\D/g, '').slice(0, 14) + crypto.randomInt(1000, 9999);

  const depositTx = db.transaction(() => {
    const r = db.prepare("INSERT INTO deposit_orders (order_no, user_id, amount, channel, status, paid_at) VALUES (?, ?, ?, 'mock', 'paid', CURRENT_TIMESTAMP)")
      .run(orderNo, req.user.id, amount);
    postLedger({
      userId: req.user.id,
      amount,
      type: 'deposit',
      refType: 'deposit_order',
      refId: r.lastInsertRowid,
      remark: `充值订单 ${orderNo}（mock 测试通道）`,
      operatorId: req.user.id
    });
  });
  depositTx();

  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  logAudit(req.user.id, 'deposit', 'user', req.user.id, { amount }, req.ip);
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

  const target = type === 'phone' ? user?.phone : type === 'email' ? user?.email : null;
  if (!target) {
    return res.status(400).json({ error: type === 'phone' ? '未绑定手机号' : type === 'email' ? '未绑定邮箱' : '无效的验证类型' });
  }

  // 发送频率限制（同一目标 60 秒内仅允许一次）
  const recent = db.prepare(`
    SELECT created_at FROM verification_codes
    WHERE target = ? AND type = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(target, type);
  if (recent) {
    const diff = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    if (diff < 60) {
      return res.status(429).json({ error: `发送过于频繁，请 ${Math.ceil(60 - diff)} 秒后再试` });
    }
  }

  if (type === 'phone') {
    if (!user.phone) return res.status(400).json({ error: '未绑定手机号' });
    // 生成6位验证码
    const code = Math.random().toString().slice(2, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分钟过期

    db.prepare(`
      INSERT INTO verification_codes (code, type, target, purpose, expires_at, used)
      VALUES (?, ?, ?, 'login', ?, 0)
    `).run(code, 'phone', user.phone, expiresAt);

    // TODO: 实际发送短信
    console.log(`[验证码] 手机号 ${user.phone} 的验证码是: ${code}`);

    // 验证码仅允许在非生产环境返回给前端
    res.json({ message: '验证码已发送', ...(process.env.NODE_ENV !== 'production' && { code }) });
  } else if (type === 'email') {
    if (!user.email) return res.status(400).json({ error: '未绑定邮箱' });
    const code = Math.random().toString().slice(2, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO verification_codes (code, type, target, purpose, expires_at, used)
      VALUES (?, ?, ?, 'login', ?, 0)
    `).run(code, 'email', user.email, expiresAt);

    // TODO: 实际发送邮件
    console.log(`[验证码] 邮箱 ${user.email} 的验证码是: ${code}`);

    res.json({ message: '验证码已发送', ...(process.env.NODE_ENV !== 'production' && { code }) });
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
  if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(new_password)) {
    return res.status(400).json({ error: '密码需包含字母和数字' });
  }

  const user = db.prepare('SELECT phone, email FROM users WHERE id = ?').get(req.user.id);

  // 获取目标（手机号或邮箱）
  const target = verification_type === 'phone' ? user.phone : user.email;
  if (!target) {
    return res.status(400).json({ error: verification_type === 'phone' ? '未绑定手机号' : '未绑定邮箱' });
  }

  // 验证验证码（仅接受登录/密码修改用途的验证码，防止注册验证码被复用）
  const codeRecord = db.prepare(`
    SELECT id FROM verification_codes
    WHERE code = ? AND type = ? AND target = ? AND purpose = 'login' AND used = 0 AND expires_at > datetime('now')
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
    // 仅允许常见位图格式（拒绝 SVG 等，防止存储型 XSS）
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传 JPG/PNG/WebP/GIF 图片'));
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
