// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

// 启动完整主服务（含全部业务路由、限流与安全中间件），再叠加 Cloudflare 固定域名隧道。
// 历史版本在此文件里复制了一份残缺的 Express 应用，已改为直接复用 server/index.js。

// 加载环境变量
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

require('./index');

const PORT = process.env.PORT || 3000;

// 读取隧道配置
const tunnelNamePath = path.join(__dirname, '..', 'tunnel-name.txt');
const tunnelDomainPath = path.join(__dirname, '..', 'tunnel-domain.txt');

if (!fs.existsSync(tunnelNamePath)) {
  console.log('');
  console.log('  [错误] 未找到隧道配置！');
  console.log('  请先运行 setup-tunnel.bat 配置固定域名。');
  process.exit(0);
}

const tunnelName = fs.readFileSync(tunnelNamePath, 'utf8').trim();
const domain = fs.existsSync(tunnelDomainPath) ? fs.readFileSync(tunnelDomainPath, 'utf8').trim() : '';

console.log('');
console.log('  正在连接固定隧道 [' + tunnelName + ']...');

const cfPath = path.join('C:\\', 'Program Files (x86)', 'cloudflared', 'cloudflared.exe');
const tunnel = spawn(cfPath, ['tunnel', '--url', `http://localhost:${PORT}`, 'run', tunnelName], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let shown = false;

function checkOutput(data) {
  const text = data.toString();
  // 检测已连接
  if ((text.includes('Registered') || text.includes('connected') || text.includes('INF')) && !shown) {
    shown = true;
    console.log('');
    console.log('  ========================================');
    if (domain) {
      console.log('  固定公网地址: https://' + domain);
    } else {
      console.log('  隧道已连接！');
      console.log('  请访问你在 Cloudflare 配置的域名。');
    }
    console.log('  ========================================');
    console.log('  此地址固定不变，可直接分享给任何人！');
    console.log('  ========================================');
    console.log('');
  }
}

tunnel.stdout.on('data', checkOutput);
tunnel.stderr.on('data', checkOutput);

tunnel.on('close', (code) => {
  console.log('  隧道连接断开，code:', code);
  console.log('  请检查网络连接或重新运行 setup-tunnel.bat');
});
