// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

// 加载环境变量（Docker 环境中已通过环境变量注入，此步骤可选）
try {
  require('dotenv').config();
} catch (e) {
  // dotenv 未安装或加载失败，忽略
}

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const os = require('os');
const db = require('./db');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const {
  helmetConfig,
  apiLimiter,
  loginLimiter,
  verificationLimiter,
  registerLimiter,
  sensitiveLimiter,
  corsConfig
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;

// 公网经 ngrok/Nginx 反代进入时带 X-Forwarded-For 头；
// 不开启 trust proxy 会导致 express-rate-limit 校验异常（限流路由 500）
app.set('trust proxy', 1);

// 获取本机局域网 IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        let priority = 0;
        // WLAN/WiFi 最优先
        if (/wlan|wi-?fi|wireless/i.test(name)) priority = 3;
        // 以太网次之（排除 VirtualBox 等虚拟网卡）
        else if (/以太网|ethernet/i.test(name) && !/virtualbox|vmware|vbox/i.test(name)) priority = 2;
        // 169.254.x.x APIPA 地址最低
        if (iface.address.startsWith('169.254.')) priority = 0;
        // VirtualBox 等虚拟网卡
        if (/virtualbox|vmware|vbox|192\.168\.56\./i.test(name + iface.address)) priority = 1;
        candidates.push({ address: iface.address, name, priority });
      }
    }
  }
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
}

// ============ 安全中间件 ============
// Helmet: 设置安全 HTTP 头
app.use(helmetConfig);

// CORS: 跨域配置
app.use(cors(corsConfig));

// 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求日志
app.use(logger.middleware());
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  next();
});

// gzip 压缩（公网访问大幅减少传输体积）
app.use(compression());

// 静态文件：带哈希的 assets 可长期强缓存；index.html 不缓存保证发版即生效
app.use(express.static(path.join(__dirname, '..', 'client', 'dist'), {
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// 上传文件目录
// 敏感目录（认证材料/施工过程照片与图纸）必须带有效令牌访问
// （支持 Authorization 头或 ?token= 查询参数，后者供 <img>/<a> 使用）
function requireUploadToken(req, res, next) {
  const jwt = require('jsonwebtoken');
  const authHeader = req.headers.authorization || '';
  const queryToken = req.query.token || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : String(queryToken);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const blacklisted = db.prepare('SELECT id FROM token_blacklist WHERE jti = ?').get(payload.jti || '');
    if (blacklisted) throw new Error('blacklisted');
    const userRow = db.prepare('SELECT is_disabled FROM users WHERE id = ?').get(payload.id);
    if (!userRow || userRow.is_disabled) throw new Error('disabled');
    req.uploadUser = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: '访问认证材料需要登录凭证' });
  }
}
app.use('/uploads/certifications', requireUploadToken);
app.use('/uploads/construction', requireUploadToken);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ API 路由（带速率限制）============
// 健康检查（供运维探活，无需认证）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// 认证相关（严格限制）
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/login/phone', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/deposit', sensitiveLimiter);
// 密码重置链路限流：6位验证码若不限速可被暴力枚举
app.use('/api/auth/forgot-password', sensitiveLimiter);
app.use('/api/auth/reset-password', sensitiveLimiter);
app.use('/api/auth', require('./routes/auth'));

// 验证码（限制发送频率）
app.use('/api/verification', verificationLimiter, require('./routes/verification'));

// 业务 API（一般限制）
app.use('/api/projects', apiLimiter, require('./routes/projects'));
app.use('/api/projects/:projectId/tasks', apiLimiter, require('./routes/tasks'));
app.use('/api/projects/:projectId/milestones', apiLimiter, require('./routes/milestones'));
app.use('/api/projects/:projectId/construction', apiLimiter, require('./routes/construction'));
app.use('/api/bids', apiLimiter, require('./routes/bids'));
app.use('/api/contracts', apiLimiter, require('./routes/contracts'));
app.use('/api/reviews', apiLimiter, require('./routes/reviews'));
app.use('/api/messages', apiLimiter, require('./routes/messages'));
app.use('/api/dashboard', apiLimiter, require('./routes/dashboard'));
app.use('/api/finance', sensitiveLimiter, require('./routes/finance'));
app.use('/api/biz', apiLimiter, require('./routes/biz'));
app.use('/api/notify', require('./routes/notify'));
app.use('/api/admin', sensitiveLimiter, require('./routes/admin'));

// ============ 商用化定时任务：质保金到期自动释放 ============
const { postLedger } = require('./utils/ledger');
function releaseDueRetentions() {
  try {
    const due = db.prepare(`
      SELECT c.*, p.title FROM contracts c JOIN projects p ON c.project_id = p.id
      WHERE c.retention_amount > 0 AND c.retention_released_at IS NULL AND c.status = 'completed'
        AND datetime(c.completed_at, '+' || c.warranty_months || ' months') <= datetime('now')
    `).all();
    due.forEach(c => {
      const tx = db.transaction(() => {
        postLedger({
          userId: c.engineer_id,
          amount: c.retention_amount,
          type: 'retention_release',
          refType: 'contract',
          refId: c.id,
          remark: `质保金到期释放（合同#${c.id}「${c.title}」）`
        });
        recordPlatformIncomeRefund(c);
      });
      tx();
      console.log(`[质保金] 合同#${c.id} 质保金 ${c.retention_amount} 元已释放给工程师#${c.engineer_id}`);
    });
  } catch (err) {
    console.error('[质保金] 释放任务失败:', err);
  }
}
function recordPlatformIncomeRefund(c) {
  const { recordPlatformIncome } = require('./utils/ledger');
  recordPlatformIncome({ type: 'retention', amount: -c.retention_amount, refType: 'contract', refId: c.id, remark: `质保金释放核销（合同#${c.id}）` });
  db.prepare('UPDATE contracts SET retention_released_at = CURRENT_TIMESTAMP WHERE id = ?').run(c.id);
}
setInterval(releaseDueRetentions, 60 * 60 * 1000); // 每小时检查一次
releaseDueRetentions();

// API 未匹配路径返回 JSON（避免被 SPA 兜底成 HTML，前端报错难排查）
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: '接口不存在', path: req.originalUrl });
});

// 前端路由回退
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('========================================');
  console.log('  弱电工程管理平台已启动');
  console.log('========================================');
  console.log(`  本机访问: http://localhost:${PORT}`);
  console.log(`  局域网访问: http://${ip}:${PORT}`);
  console.log('========================================');
  console.log('  安全特性已启用:');
  console.log('  - Helmet 安全头');
  console.log('  - API 速率限制');
  console.log('  - 登录防暴力破解');
  console.log('  - JWT 令牌刷新机制');
  console.log('========================================');
});

// 优雅退出：先关闭 SQLite 句柄再退出，避免 WAL/SHM 残留
function shutdown(signal) {
  console.log(`\n收到 ${signal} 信号，正在关闭服务...`);
  try {
    db.close();
    console.log('数据库已安全关闭');
  } catch (e) {
    console.error('关闭数据库失败:', e.message);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 未捕获的 Promise 拒绝记录到结构化日志（Node 默认行为保留）
process.on('unhandledRejection', (reason) => {
  logger.error({ kind: 'unhandled_rejection', error: String((reason && reason.message) || reason) });
});
