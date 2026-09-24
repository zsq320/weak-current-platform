// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 关键业务节点邮件通知（ fire-and-forget，绝不阻塞/影响主流程）
 * 生效条件（两者同时满足）：
 *  1. .env 配置了 SMTP_USER/SMTP_PASS（即 isEmailConfigured()）
 *  2. .env 设置 EMAIL_NOTIFY_ENABLED=1（默认关闭，避免误发扰客）
 */

const db = require('../db');
const { sendRawMail, isEmailConfigured } = require('./email');

function wrapHtml(title, body) {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:'Microsoft YaHei',Arial,sans-serif;background:#f5f5f5;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;">
    <h2 style="color:#1B5288;font-size:18px;margin:0 0 16px;">弱电工程管理平台</h2>
    <div style="color:#333;font-size:14px;line-height:1.8;">${body}</div>
    <p style="color:#999;font-size:12px;margin-top:28px;">请登录平台查看详情。此邮件为系统自动发送，请勿回复。</p>
  </div>
</body></html>`.trim();
}

/**
 * 给用户发送业务通知邮件
 * @param {number} userId
 * @param {string} subject 邮件主题（不含平台前缀）
 * @param {string} body 正文（纯文本，会做 HTML 转义）
 */
function notifyUserEmail(userId, subject, body) {
  // 同步部分包在 try 里保证绝不抛出；发送本身异步不等待
  try {
    if (process.env.EMAIL_NOTIFY_ENABLED !== '1' || !isEmailConfigured()) return;
    const user = db.prepare('SELECT email, is_disabled FROM users WHERE id = ?').get(userId);
    if (!user || !user.email || user.is_disabled) return;

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = wrapHtml(subject, esc(body).replace(/\n/g, '<br/>'));
    sendRawMail(user.email, `【弱电工程管理平台】${subject}`, html)
      .catch(err => console.error('[notifyEmail] 发送异常:', err.message));
  } catch (e) {
    console.error('[notifyEmail] 通知准备失败:', e.message);
  }
}

module.exports = { notifyUserEmail };
