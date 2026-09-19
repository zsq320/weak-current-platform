// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 短信发送适配器
 *
 * 渠道选择（按环境变量自动切换，均未配置时回退 mock 控制台输出）：
 * 1. SMS_API_URL —— 通用 HTTP 网关（市面上多数短信服务商提供
 *    形如 http://api.xxx.com/sms?phone={phone}&content={content} 的接口）。
 *    支持 {phone}/{content} 占位符，方法由 SMS_API_METHOD 指定（默认 GET）。
 * 2. mock —— 验证码打印到控制台（开发/演示模式）。
 *
 * 阿里云/腾讯云官方 SDK 需要安装其依赖并配置签名（需企业资质申请），
 * 集成指引见 docs/COMMERCIAL.md。
 */

const crypto = require('crypto');

const SMS_API_URL = process.env.SMS_API_URL || '';
const SMS_API_METHOD = (process.env.SMS_API_METHOD || 'GET').toUpperCase();
const SMS_TIMEOUT = Number(process.env.SMS_TIMEOUT || 5000);

function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendViaGenericGateway(phone, content) {
  const url = SMS_API_URL
    .replace('{phone}', encodeURIComponent(phone))
    .replace('{content}', encodeURIComponent(content));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMS_TIMEOUT);

  try {
    const res = await fetch(url, { method: SMS_API_METHOD, signal: controller.signal });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`短信网关返回 ${res.status}: ${body.slice(0, 200)}`);
    }
    return { success: true, channel: 'gateway', messageId: `gw_${Date.now()}` };
  } finally {
    clearTimeout(timer);
  }
}

async function sendMock(phone, code) {
  console.log('='.repeat(50));
  console.log(`【短信验证码-mock】发送到 ${phone}`);
  console.log(`验证码: ${code}`);
  console.log(`有效期: 5分钟`);
  console.log('='.repeat(50));
  await new Promise(resolve => setTimeout(resolve, 100));
  return { success: true, channel: 'mock', messageId: `mock_${Date.now()}` };
}

/**
 * 发送短信验证码
 * @returns {{ success: boolean, channel: string, messageId: string }}
 */
async function sendSMS(phone, code) {
  if (SMS_API_URL) {
    try {
      return await sendViaGenericGateway(phone, `【弱电工程管理平台】您的验证码为 ${code}，5分钟内有效，请勿泄露。`);
    } catch (err) {
      console.error('[sms] 网关发送失败，回退 mock:', err.message);
      // 网关故障时回退 mock，保证验证码流程可用（生产应告警）
      return await sendMock(phone, code);
    }
  }
  return await sendMock(phone, code);
}

module.exports = { generateCode, sendSMS };
