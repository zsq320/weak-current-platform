// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 结构化日志：JSONL 落盘 logs/app-YYYYMMDD.log，便于采集到 ELK/Loki。
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function logFile() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return path.join(logsDir, `app-${day}.log`);
}

function write(level, payload) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...payload });
  try {
    fs.appendFileSync(logFile(), line + '\n');
  } catch (e) { /* 日志失败不阻塞业务 */ }
  if (level === 'error') console.error(line);
}

const logger = {
  info: (payload) => write('info', payload),
  warn: (payload) => write('warn', payload),
  error: (payload) => write('error', payload),
  middleware() {
    return (req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        // 健康检查与静态资源不记访问日志
        if (req.path === '/api/health' || !req.path.startsWith('/api')) return;
        write('info', {
          kind: 'access',
          method: req.method,
          path: req.originalUrl ? req.originalUrl.split('?')[0] : req.path, // 剥离查询串，避免令牌入日志
          status: res.statusCode,
          ms: Date.now() - start,
          user_id: req.user ? req.user.id : null,
          ip: req.ip
        });
      });
      next();
    };
  }
};

module.exports = logger;
