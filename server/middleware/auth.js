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
 * JWT 认证中间件
 * - 访问令牌有效期：1小时
 * - 刷新令牌有效期：7天
 * - 支持令牌黑名单（登出后立即失效）
 */

const jwt = require('jsonwebtoken');
const db = require('../db');

// JWT 密钥 - 必须从环境变量读取，禁止硬编码
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET || JWT_SECRET;

// 如果没有设置 JWT_SECRET，直接报错阻止启动
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is required!');
  console.error('Please set JWT_SECRET in .env file:');
  console.error('  JWT_SECRET=your-random-secret-key-min-32-chars');
  process.exit(1);
}

// 令牌有效期配置
const ACCESS_TOKEN_EXPIRES = '1h';      // 访问令牌 1小时
const REFRESH_TOKEN_EXPIRES = '7d';     // 刷新令牌 7天
const ACCESS_TOKEN_EXPIRES_SECONDS = 3600;      // 1小时
const REFRESH_TOKEN_EXPIRES_SECONDS = 7 * 86400; // 7天

/**
 * 生成唯一 JTI (JWT ID)
 */
function generateJti() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成访问令牌
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      type: 'access',
      jti: generateJti()
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES, algorithm: 'HS256' }
  );
}

/**
 * 生成刷新令牌
 */
function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      type: 'refresh',
      jti: generateJti()
    },
    REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES, algorithm: 'HS256' }
  );
}

/**
 * 生成令牌对
 */
function generateTokenPair(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  return { accessToken, refreshToken };
}

/**
 * 检查令牌是否在黑名单中
 */
function isTokenBlacklisted(jti) {
  if (!jti) return false;
  const result = db.prepare(
    'SELECT id FROM token_blacklist WHERE jti = ? AND expires_at > datetime(\'now\')'
  ).get(jti);
  return !!result;
}

/**
 * 将令牌加入黑名单
 */
function blacklistToken(jti, tokenType, expiresAt) {
  if (!jti) return;
  try {
    db.prepare(
      'INSERT OR IGNORE INTO token_blacklist (jti, token_type, expires_at) VALUES (?, ?, ?)'
    ).run(jti, tokenType, expiresAt);
  } catch (err) {
    console.error('Failed to blacklist token:', err);
  }
}

/**
 * 验证访问令牌中间件
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    // 验证令牌类型
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: '无效的令牌类型' });
    }

    // 检查黑名单
    if (isTokenBlacklisted(decoded.jti)) {
      return res.status(401).json({ error: '令牌已失效，请重新登录' });
    }

    req.user = decoded;
    req.tokenJti = decoded.jti;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期，请刷新令牌或重新登录', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: '无效的令牌' });
  }
}

/**
 * 可选认证中间件
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      if (!isTokenBlacklisted(decoded.jti)) {
        req.user = decoded;
      }
    } catch (err) {
      // 忽略错误，继续处理
    }
  }
  next();
}

/**
 * 角色验证中间件
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录，请先登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

/**
 * 刷新访问令牌
 * @param {string} refreshToken - 刷新令牌
 * @returns {Object} - 新的令牌对
 */
function refreshAccessToken(refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET, { algorithms: ['HS256'] });

    // 验证令牌类型
    if (decoded.type !== 'refresh') {
      throw new Error('无效的令牌类型');
    }

    // 检查黑名单
    if (isTokenBlacklisted(decoded.jti)) {
      throw new Error('刷新令牌已失效');
    }

    // 获取最新用户信息
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      throw new Error('用户不存在');
    }
    if (user.is_disabled) {
      throw new Error('账户已被禁用');
    }

    // 将旧的刷新令牌加入黑名单
    blacklistToken(decoded.jti, 'refresh', new Date(decoded.exp * 1000).toISOString());

    // 生成新的令牌对
    return generateTokenPair(user);
  } catch (err) {
    throw new Error('刷新令牌无效或已过期');
  }
}

/**
 * 登出 - 将令牌加入黑名单
 */
function logout(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
      if (decoded.jti && decoded.exp) {
        blacklistToken(decoded.jti, decoded.type || 'access', new Date(decoded.exp * 1000).toISOString());
      }
    } catch (err) {
      // 忽略验证错误，继续处理
    }
  }
  next();
}

module.exports = {
  authMiddleware,
  optionalAuth,
  requireRole,
  logout,
  generateTokenPair,
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  isTokenBlacklisted,
  blacklistToken,
  JWT_SECRET,
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_EXPIRES,
  ACCESS_TOKEN_EXPIRES_SECONDS,
  REFRESH_TOKEN_EXPIRES_SECONDS
};
