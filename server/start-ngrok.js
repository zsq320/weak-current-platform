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
const fs = require('fs');
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

// 查找 ngrok 可执行文件
function findNgrokBin() {
  const candidates = [
    path.join(__dirname, '..', 'node_modules', 'ngrok', 'bin', 'ngrok.exe'),
    path.join(__dirname, '..', 'node_modules', 'ngrok', 'bin', 'ngrok'),
    path.join(__dirname, 'node_modules', 'ngrok', 'bin', 'ngrok.exe'),
    path.join(__dirname, 'node_modules', 'ngrok', 'bin', 'ngrok'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('  弱电工程管理平台已启动');
  console.log('========================================');
  console.log(`  本机访问: http://localhost:${PORT}`);
  console.log('');
  console.log('  正在连接 ngrok 隧道...');

  // 读取配置
  const tokenPath = path.join(__dirname, '..', 'ngrok-token.txt');
  const domainPath = path.join(__dirname, '..', 'ngrok-domain.txt');

  if (!fs.existsSync(tokenPath)) {
    console.log('');
    console.log('  [错误] 未找到 ngrok 配置！');
    console.log('  请先运行 setup-ngrok.bat 完成配置。');
    return;
  }

  const authToken = fs.readFileSync(tokenPath, 'utf8').trim();
  const domain = fs.existsSync(domainPath) ? fs.readFileSync(domainPath, 'utf8').trim() : null;

  const ngrokBin = findNgrokBin();
  if (!ngrokBin) {
    console.error('');
    console.error('  [错误] 未找到 ngrok 可执行文件');
    console.error('  请运行 npm install 重新安装依赖');
    return;
  }

  // 使用 ngrok CLI 直接启动隧道
  const args = ['http', String(PORT), '--authtoken', authToken];
  if (domain) {
    args.push('--domain', domain);
  }

  const ngrokProcess = spawn(ngrokBin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let started = false;

  ngrokProcess.stdout.on('data', (data) => {
    const text = data.toString();
    if (!started && text.includes('started')) {
      started = true;
    }
  });

  ngrokProcess.stderr.on('data', (data) => {
    const text = data.toString();
    // ngrok 把启动信息输出到 stderr
    if (text.includes('started tunnel') || text.includes('url=')) {
      started = true;
    }
  });

  // 给 ngrok 一些时间启动，然后通过 API 检查
  setTimeout(async () => {
    try {
      const http = require('http');
      const checkUrl = 'http://127.0.0.1:4040/api/tunnels';

      const fetchTunnels = () => new Promise((resolve, reject) => {
        http.get(checkUrl, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
          });
        }).on('error', reject);
      });

      const tunnels = await fetchTunnels();
      if (tunnels.tunnels && tunnels.tunnels.length > 0) {
        const publicUrl = tunnels.tunnels[0].public_url;
        console.log('');
        console.log('  ========================================');
        console.log('  公网地址: ' + publicUrl);
        console.log('  ========================================');
        console.log('  此地址固定不变，任何人通过此地址即可访问！');
        console.log('  ========================================');
        console.log('');
      } else {
        console.log('');
        console.log('  ngrok 隧道已启动，公网地址:');
        console.log('  ' + (domain || '请查看 ngrok 控制台: http://127.0.0.1:4040'));
        console.log('');
      }
    } catch (err) {
      console.log('');
      console.log('  ngrok 隧道已启动');
      if (domain) {
        console.log('  公网地址: https://' + domain);
      }
      console.log('  可在浏览器打开 http://127.0.0.1:4040 查看隧道状态');
      console.log('');
    }
  }, 5000);

  ngrokProcess.on('error', (err) => {
    console.error('');
    console.error('  ngrok 启动失败:', err.message);
  });

  ngrokProcess.on('exit', (code) => {
    if (code && code !== 0) {
      console.error('');
      console.error(`  ngrok 进程退出，代码: ${code}`);
    }
  });

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n  正在断开隧道...');
    ngrokProcess.kill();
    process.exit(0);
  });
});
