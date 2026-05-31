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
 * 请求验证中间件
 */

// 手机号正则（中国大陆）
const PHONE_REGEX = /^1[3-9]\d{9}$/;

// 邮箱正则
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 用户名正则（4-20位字母数字下划线）
const USERNAME_REGEX = /^[a-zA-Z0-9_]{4,20}$/;

// 密码强度（至少6位，包含字母和数字）
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

/**
 * 验证手机号
 */
function validatePhone(phone) {
  if (!phone) return { valid: false, message: '请输入手机号' };
  if (!PHONE_REGEX.test(phone)) return { valid: false, message: '手机号格式不正确' };
  return { valid: true };
}

/**
 * 验证邮箱
 */
function validateEmail(email) {
  if (!email) return { valid: false, message: '请输入邮箱' };
  if (!EMAIL_REGEX.test(email)) return { valid: false, message: '邮箱格式不正确' };
  return { valid: true };
}

/**
 * 验证用户名
 */
function validateUsername(username) {
  if (!username) return { valid: false, message: '请输入用户名' };
  if (!USERNAME_REGEX.test(username)) {
    return { valid: false, message: '用户名需为4-20位字母、数字或下划线' };
  }
  return { valid: true };
}

/**
 * 验证密码强度
 */
function validatePassword(password) {
  if (!password) return { valid: false, message: '请输入密码' };
  if (password.length < 6) return { valid: false, message: '密码长度不能少于6位' };
  if (!PASSWORD_REGEX.test(password)) {
    return { valid: false, message: '密码需包含字母和数字' };
  }
  return { valid: true };
}

/**
 * 验证注册请求
 */
function validateRegister(req, res, next) {
  const { username, password, phone, email } = req.body;
  const errors = [];

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.valid) errors.push(usernameCheck.message);

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) errors.push(passwordCheck.message);

  const phoneCheck = validatePhone(phone);
  if (!phoneCheck.valid) errors.push(phoneCheck.message);

  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) errors.push(emailCheck.message);

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join('; ') });
  }

  next();
}

/**
 * 验证登录请求
 */
function validateLogin(req, res, next) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  next();
}

/**
 * 验证手机验证码登录
 */
function validatePhoneLogin(req, res, next) {
  const { phone, code } = req.body;

  if (!phone) {
    return res.status(400).json({ error: '请输入手机号' });
  }

  const phoneCheck = validatePhone(phone);
  if (!phoneCheck.valid) {
    return res.status(400).json({ error: phoneCheck.message });
  }

  if (!code) {
    return res.status(400).json({ error: '请输入验证码' });
  }

  next();
}

module.exports = {
  validatePhone,
  validateEmail,
  validateUsername,
  validatePassword,
  validateRegister,
  validateLogin,
  validatePhoneLogin,
  PHONE_REGEX,
  EMAIL_REGEX,
  USERNAME_REGEX,
  PASSWORD_REGEX
};
