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
const cors = require('cors');
const path = require('path');
const os = require('os');
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
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  next();
});

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// ============ API 路由（带速率限制）============
// 认证相关（严格限制）
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/login/phone', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth', require('./routes/auth'));

// 验证码（限制发送频率）
app.use('/api/verification', verificationLimiter, require('./routes/verification'));

// 业务 API（一般限制）
app.use('/api/projects', apiLimiter, require('./routes/projects'));
app.use('/api/projects/:projectId/tasks', apiLimiter, require('./routes/tasks'));
app.use('/api/projects/:projectId/milestones', apiLimiter, require('./routes/milestones'));
app.use('/api/bids', apiLimiter, require('./routes/bids'));
app.use('/api/contracts', apiLimiter, require('./routes/contracts'));
app.use('/api/reviews', apiLimiter, require('./routes/reviews'));
app.use('/api/messages', apiLimiter, require('./routes/messages'));
app.use('/api/dashboard', apiLimiter, require('./routes/dashboard'));
app.use('/api/admin', sensitiveLimiter, require('./routes/admin'));

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
