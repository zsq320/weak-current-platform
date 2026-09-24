// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

// 启动完整主服务（含全部业务路由、限流与安全中间件），再叠加 ngrok 公网隧道。
// 历史版本在此文件里复制了一份残缺的 Express 应用（缺少 biz/finance/tasks 等路由
// 与安全中间件），已改为直接复用 server/index.js，避免两套行为不一致的服务。

// 加载环境变量
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

require('./index');

const PORT = process.env.PORT || 3000;

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

(function startTunnel() {
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

  // 给 ngrok 一些时间启动，然后通过本地 API 检查隧道状态
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

  process.on('SIGINT', () => {
    console.log('\n  正在断开隧道...');
    ngrokProcess.kill();
    process.exit(0);
  });
})();
