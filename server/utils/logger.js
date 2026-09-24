// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 结构化日志：JSONL 落盘 logs/app-YYYYMMDD.log，便于采集到 ELK/Loki。
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// 日志保留天数：每日清理一次过期日志，防止磁盘被无限占用
const LOG_RETENTION_DAYS = 30;
function cleanupOldLogs() {
  try {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    fs.readdirSync(logsDir)
      .filter(f => /^app-\d{8}\.log$/.test(f))
      .forEach(f => {
        const p = path.join(logsDir, f);
        if (fs.statSync(p).mtimeMs < cutoff) {
          fs.unlinkSync(p);
        }
      });
  } catch (e) { /* 清理失败不影响业务 */ }
}
cleanupOldLogs();
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

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
      // 路径必须在挂载时固化：Express 挂载路由会剥离前缀改写 req.url，
      // 若在 finish 回调里读 req.path，真实 API 请求的 path 会变成 '/'，
      // 导致健康检查判断失真、访问日志被整体静默丢弃（只余 404 等未匹配路径）
      const reqPath = req.originalUrl ? req.originalUrl.split('?')[0] : req.path; // 剥离查询串，避免令牌入日志
      res.on('finish', () => {
        // 健康检查与静态资源不记访问日志
        if (reqPath === '/api/health' || !reqPath.startsWith('/api')) return;
        write('info', {
          kind: 'access',
          method: req.method,
          path: reqPath,
          status: res.statusCode,
          ms: Date.now() - start,
          // 日志中间件在鉴权之前挂载，req.user 此时尚未填充；
          // 从令牌载荷解出用户（仅用于日志展示，不做任何鉴权判定）
          user_id: req.user ? req.user.id : decodeTokenUserId(req),
          ip: req.ip
        });
      });
      next();
    };
  }
};

// 从 Authorization 头的 JWT 载荷中解出用户 id（不验签，仅日志用）
function decodeTokenUserId(req) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return null;
    const payload = Buffer.from(header.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed = JSON.parse(payload);
    return parsed && parsed.id ? parsed.id : null;
  } catch (e) {
    return null;
  }
}

module.exports = logger;
