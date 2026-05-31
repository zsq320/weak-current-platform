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
 * 安全中间件配置
 * - Helmet: 安全 HTTP 头
 * - Rate Limit: 请求频率限制
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/**
 * Helmet 安全头配置
 */
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" }
});

/**
 * 全局 API 速率限制
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100个请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 登录速率限制（更严格）
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 10, // 最多10次登录尝试
  message: { error: '登录尝试过多，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // 成功的登录不计入限制
});

/**
 * 验证码发送速率限制
 */
const verificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 3, // 最多3次
  message: { error: '验证码发送过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 注册速率限制
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 5, // 最多5次注册
  message: { error: '注册过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 敏感操作速率限制（如充值）
 */
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 20, // 最多20次
  message: { error: '操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * CORS 配置
 */
const corsConfig = {
  origin: function (origin, callback) {
    // 允许的源列表
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'];

    // 开发环境允许所有来源
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS 不允许的来源'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

module.exports = {
  helmetConfig,
  apiLimiter,
  loginLimiter,
  verificationLimiter,
  registerLimiter,
  sensitiveLimiter,
  corsConfig
};
