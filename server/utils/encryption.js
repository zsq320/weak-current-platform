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
 * 敏感数据加密工具
 * 使用 AES-256-GCM 加密敏感信息（身份证号、银行卡号等）
 */

const crypto = require('crypto');

// 加密算法
const ALGORITHM = 'aes-256-gcm';
// 密钥长度
const KEY_LENGTH = 32;
// IV 长度
const IV_LENGTH = 16;
// Auth Tag 长度
const AUTH_TAG_LENGTH = 16;

/**
 * 获取加密密钥
 * 从环境变量读取，如果不存在则生成一个（仅开发环境）
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (key) {
    // 如果提供了密钥，确保它是正确的长度
    return crypto.scryptSync(key, 'salt', KEY_LENGTH);
  }

  // 开发环境警告
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[Security] ENCRYPTION_KEY not set, using development key. DO NOT use in production!');
    // 使用固定的开发密钥（仅用于开发）
    return crypto.scryptSync('dev-encryption-key-for-development-only', 'salt', KEY_LENGTH);
  }

  throw new Error('ENCRYPTION_KEY environment variable is required in production');
}

/**
 * 加密数据
 * @param {string} plaintext - 明文数据
 * @returns {string} - 加密后的字符串（格式：iv:authTag:ciphertext，均为hex）
 */
function encrypt(plaintext) {
  if (!plaintext) return null;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // 返回格式：iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * 解密数据
 * @param {string} encryptedData - 加密字符串（格式：iv:authTag:ciphertext）
 * @returns {string} - 解密后的明文
 */
function decrypt(encryptedData) {
  if (!encryptedData) return null;

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * 加密身份证号
 * @param {string} idCard - 身份证号
 * @returns {string} - 加密后的字符串
 */
function encryptIdCard(idCard) {
  if (!idCard) return null;
  return encrypt(idCard);
}

/**
 * 解密身份证号
 * @param {string} encrypted - 加密后的字符串
 * @returns {string} - 身份证号
 */
function decryptIdCard(encrypted) {
  return decrypt(encrypted);
}

/**
 * 加密银行卡号
 * @param {string} bankCard - 银行卡号
 * @returns {string} - 加密后的字符串
 */
function encryptBankCard(bankCard) {
  if (!bankCard) return null;
  return encrypt(bankCard);
}

/**
 * 解密银行卡号
 * @param {string} encrypted - 加密后的字符串
 * @returns {string} - 银行卡号
 */
function decryptBankCard(encrypted) {
  return decrypt(encrypted);
}

/**
 * 手机号脱敏（13812345678 -> 138****5678）
 * @param {string} phone - 手机号
 * @returns {string} - 脱敏后的手机号
 */
function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(7);
}

/**
 * 邮箱脱敏（zhangsan@example.com -> z****n@example.com）
 * @param {string} email - 邮箱
 * @returns {string} - 脱敏后的邮箱
 */
function maskEmail(email) {
  if (!email) return email;
  const [username, domain] = email.split('@');
  if (!username || !domain) return email;

  if (username.length <= 2) {
    return username[0] + '****@' + domain;
  }
  return username[0] + '****' + username[username.length - 1] + '@' + domain;
}

/**
 * 身份证号脱敏（110101199001011234 -> 1101**********1234）
 * @param {string} idCard - 身份证号
 * @returns {string} - 脱敏后的身份证号
 */
function maskIdCard(idCard) {
  if (!idCard || idCard.length !== 17 && idCard.length !== 18) return idCard;
  return idCard.slice(0, 3) + '***********' + idCard.slice(-4);
}

/**
 * 银行卡号脱敏（6222021234567890123 -> 6222**********0123）
 * @param {string} bankCard - 银行卡号
 * @returns {string} - 脱敏后的银行卡号
 */
function maskBankCard(bankCard) {
  if (!bankCard || bankCard.length < 8) return bankCard;
  return bankCard.slice(0, 4) + '********' + bankCard.slice(-4);
}

/**
 * 对用户对象进行脱敏处理
 * @param {Object} user - 用户对象
 * @param {boolean} full - 是否返回完整信息（用于内部使用）
 * @returns {Object} - 脱敏后的用户对象
 */
function sanitizeUser(user, full = false) {
  if (!user) return null;

  const sanitized = { ...user };

  // 删除敏感字段
  delete sanitized.password_hash;
  delete sanitized.id_card_encrypted;
  delete sanitized.bank_card_encrypted;

  if (!full) {
    // 对外展示时进行脱敏
    if (sanitized.phone) {
      sanitized.phone = maskPhone(sanitized.phone);
    }
    if (sanitized.email) {
      sanitized.email = maskEmail(sanitized.email);
    }
  }

  return sanitized;
}

module.exports = {
  encrypt,
  decrypt,
  encryptIdCard,
  decryptIdCard,
  encryptBankCard,
  decryptBankCard,
  maskPhone,
  maskEmail,
  maskIdCard,
  maskBankCard,
  sanitizeUser
};
