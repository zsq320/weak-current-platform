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
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  next();
});
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/admin', require('./routes/admin'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('  弱电工程管理平台已启动');
  console.log('========================================');
  console.log(`  本机访问: http://localhost:${PORT}`);
  console.log('');
  console.log('  正在创建公网隧道，请稍候...');

  // 启动 cloudflared tunnel
  const cfPath = path.join('C:\\', 'Program Files (x86)', 'cloudflared', 'cloudflared.exe');
  const tunnel = spawn(cfPath, ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let found = false;

  tunnel.stdout.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !found) {
      found = true;
      console.log('');
      console.log('  ========================================');
      console.log('  公网地址: ' + match[0]);
      console.log('  ========================================');
      console.log('  将此地址发送给任何人即可访问！');
      console.log('  ========================================');
      console.log('');
    }
  });

  tunnel.stderr.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !found) {
      found = true;
      console.log('');
      console.log('  ========================================');
      console.log('  公网地址: ' + match[0]);
      console.log('  ========================================');
      console.log('  将此地址发送给任何人即可访问！');
      console.log('  ========================================');
      console.log('');
    }
  });

  tunnel.on('close', (code) => {
    if (!found) {
      console.log('  隧道进程退出，code:', code);
      console.log('  请尝试手动运行: cloudflared tunnel --url http://localhost:3000');
    }
  });
});
