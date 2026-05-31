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
const { generateCode, sendSMS } = require('../utils/sms');
const { sendEmail } = require('../utils/email');

const router = express.Router();

// 验证码有效期（分钟）
const CODE_EXPIRE_MINUTES = 5;
// 发送间隔（秒）
const SEND_INTERVAL_SECONDS = 60;

// 手机号正则（中国大陆）
const PHONE_REGEX = /^1[3-9]\d{9}$/;
// 邮箱正则
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 检查发送频率限制
function checkRateLimit(target, type) {
  const recentCode = db.prepare(`
    SELECT created_at FROM verification_codes
    WHERE target = ? AND type = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(target, type);

  if (recentCode) {
    const lastSend = new Date(recentCode.created_at).getTime();
    const now = Date.now();
    const diff = (now - lastSend) / 1000;

    if (diff < SEND_INTERVAL_SECONDS) {
      return {
        allowed: false,
        waitSeconds: Math.ceil(SEND_INTERVAL_SECONDS - diff)
      };
    }
  }
  return { allowed: true };
}

// 发送手机验证码
router.post('/phone', async (req, res) => {
  try {
    const { phone, purpose = 'register' } = req.body;

    // 验证手机号格式
    if (!phone || !PHONE_REGEX.test(phone)) {
      return res.status(400).json({ error: '请输入正确的手机号码' });
    }

    // 验证 purpose
    if (!['register', 'login'].includes(purpose)) {
      return res.status(400).json({ error: '无效的验证类型' });
    }

    // 检查频率限制
    const rateCheck = checkRateLimit(phone, 'phone');
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: `发送过于频繁，请 ${rateCheck.waitSeconds} 秒后再试`
      });
    }

    // 注册时检查手机号是否已存在
    if (purpose === 'register') {
      const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
      if (existing) {
        return res.status(400).json({ error: '该手机号已被注册' });
      }
    }

    // 生成验证码
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000).toISOString();

    // 保存验证码
    db.prepare(`
      INSERT INTO verification_codes (target, type, code, purpose, expires_at)
      VALUES (?, 'phone', ?, ?, ?)
    `).run(phone, code, purpose, expiresAt);

    // 发送短信
    const result = await sendSMS(phone, code);

    res.json({
      message: '验证码已发送',
      // 开发环境返回验证码
      ...(process.env.NODE_ENV !== 'production' && { code })
    });
  } catch (error) {
    console.error('发送手机验证码失败:', error);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

// 发送邮箱验证码
router.post('/email', async (req, res) => {
  try {
    const { email, purpose = 'register' } = req.body;

    // 验证邮箱格式
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: '请输入正确的邮箱地址' });
    }

    // 验证 purpose
    if (!['register', 'login'].includes(purpose)) {
      return res.status(400).json({ error: '无效的验证类型' });
    }

    // 检查频率限制
    const rateCheck = checkRateLimit(email, 'email');
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: `发送过于频繁，请 ${rateCheck.waitSeconds} 秒后再试`
      });
    }

    // 注册时检查邮箱是否已存在
    if (purpose === 'register') {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) {
        return res.status(400).json({ error: '该邮箱已被注册' });
      }
    }

    // 生成验证码
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000).toISOString();

    // 保存验证码
    db.prepare(`
      INSERT INTO verification_codes (target, type, code, purpose, expires_at)
      VALUES (?, 'email', ?, ?, ?)
    `).run(email, code, purpose, expiresAt);

    // 发送邮件
    const result = await sendEmail(email, code, purpose);

    res.json({
      message: '验证码已发送',
      // 开发环境返回验证码
      ...(process.env.NODE_ENV !== 'production' && { code })
    });
  } catch (error) {
    console.error('发送邮箱验证码失败:', error);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

// 验证验证码
router.post('/verify', (req, res) => {
  try {
    const { target, type, code, purpose = 'register' } = req.body;

    // 参数验证
    if (!target || !type || !code) {
      return res.status(400).json({ error: '参数不完整' });
    }

    if (!['phone', 'email'].includes(type)) {
      return res.status(400).json({ error: '无效的验证类型' });
    }

    // 查询验证码
    const record = db.prepare(`
      SELECT * FROM verification_codes
      WHERE target = ? AND type = ? AND purpose = ? AND used = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(target, type, purpose);

    if (!record) {
      return res.status(400).json({ error: '验证码不存在或已使用' });
    }

    // 检查是否过期
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: '验证码已过期，请重新获取' });
    }

    // 检查验证码是否正确
    if (record.code !== code) {
      return res.status(400).json({ error: '验证码错误' });
    }

    // 标记为已使用
    db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(record.id);

    res.json({ message: '验证成功', verified: true });
  } catch (error) {
    console.error('验证验证码失败:', error);
    res.status(500).json({ error: '验证失败，请稍后重试' });
  }
});

module.exports = router;
