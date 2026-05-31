// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

/**
 * 邮件发送工具
 * 使用 nodemailer 发送 SMTP 邮件
 */

const nodemailer = require('nodemailer');

// 创建邮件传输器
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.qq.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '' // 授权码，非密码
  }
});

// HTML 邮件模板
function getEmailTemplate(code, purpose = 'register') {
  const title = purpose === 'login' ? '登录验证' : '注册验证';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 30px; }
    .header { text-align: center; color: #333; margin-bottom: 20px; }
    .code-box { background: #409EFF; color: #fff; font-size: 32px; text-align: center;
                padding: 20px; border-radius: 8px; letter-spacing: 8px; margin: 20px 0; }
    .info { color: #666; font-size: 14px; line-height: 1.8; }
    .footer { color: #999; font-size: 12px; text-align: center; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h2 class="header">弱电工程管理平台 - ${title}</h2>
    <div class="info">
      <p>您好！</p>
      <p>您正在进行${title}操作，验证码为：</p>
    </div>
    <div class="code-box">${code}</div>
    <div class="info">
      <p>验证码有效期为 <strong>5分钟</strong>，请勿泄露给他人。</p>
      <p>如果不是本人操作，请忽略此邮件。</p>
    </div>
    <div class="footer">
      <p>© 2026 弱电工程管理平台</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// 发送邮件验证码
async function sendEmail(to, code, purpose = 'register') {
  const title = purpose === 'login' ? '登录验证码' : '注册验证码';

  const mailOptions = {
    from: {
      name: '弱电工程管理平台',
      address: process.env.SMTP_USER || 'noreply@example.com'
    },
    to,
    subject: `【弱电工程管理平台】${title}：${code}`,
    html: getEmailTemplate(code, purpose)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] 邮件已发送到 ${to}, messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email] 发送失败:`, error.message);
    // 开发环境：即使发送失败也输出验证码到控制台
    console.log('='.repeat(50));
    console.log(`【邮件验证码】(发送失败，显示在此)`);
    console.log(`收件人: ${to}`);
    console.log(`验证码: ${code}`);
    console.log('='.repeat(50));
    return { success: false, error: error.message, code };
  }
}

module.exports = { sendEmail, getEmailTemplate };
