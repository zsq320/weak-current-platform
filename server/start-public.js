// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

// 启动完整主服务（含全部业务路由、限流与安全中间件），再叠加 Cloudflare 临时隧道。
// 历史版本在此文件里复制了一份残缺的 Express 应用，已改为直接复用 server/index.js。

// 加载环境变量
require('dotenv').config();

const path = require('path');
const { spawn } = require('child_process');

require('./index');

const PORT = process.env.PORT || 3000;

console.log('');
console.log('  正在创建公网隧道，请稍候...');

// 启动 cloudflared tunnel
const cfPath = path.join('C:\\', 'Program Files (x86)', 'cloudflared', 'cloudflared.exe');
const tunnel = spawn(cfPath, ['tunnel', '--url', `http://localhost:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let found = false;

function showUrl(text) {
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
}

tunnel.stdout.on('data', (data) => showUrl(data.toString()));
tunnel.stderr.on('data', (data) => showUrl(data.toString()));

tunnel.on('close', (code) => {
  if (!found) {
    console.log('  隧道进程退出，code:', code);
    console.log('  请尝试手动运行: cloudflared tunnel --url http://localhost:3000');
  }
});
