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
 * 短信发送工具（模拟版本）
 * 开发阶段验证码输出到控制台
 * 生产环境可替换为阿里云/腾讯云短信服务
 */

const crypto = require('crypto');

// 生成6位数字验证码
function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// 发送短信验证码（模拟）
async function sendSMS(phone, code) {
  console.log('='.repeat(50));
  console.log(`【短信验证码】发送到 ${phone}`);
  console.log(`验证码: ${code}`);
  console.log(`有效期: 5分钟`);
  console.log('='.repeat(50));

  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 100));

  return {
    success: true,
    messageId: `mock_${Date.now()}`,
    phone,
    code // 仅开发环境返回
  };
}

// 生产环境示例：阿里云短信
/*
const AliCloudSms = require('@alicloud/sms-sdk');
async function sendSMSAlidayu(phone, code) {
  const smsClient = new AliCloudSms({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY,
    secretAccessKey: process.env.ALIYUN_SECRET_KEY
  });

  return smsClient.sendSMS({
    PhoneNumbers: phone,
    SignName: '弱电工程管理平台',
    TemplateCode: 'SMS_XXXXXX',
    TemplateParam: JSON.stringify({ code })
  });
}
*/

module.exports = { generateCode, sendSMS };
