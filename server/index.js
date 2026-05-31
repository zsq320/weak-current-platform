// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

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

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  next();
});
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/admin', require('./routes/admin'));

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
  console.log('  将上面的局域网地址发送给其他人即可访问');
  console.log('========================================');
});
