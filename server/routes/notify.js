// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 实时通知（SSE）
 * GET /api/notify/stream?token=xxx —— EventSource 无法携带 Authorization 头，用 query 传令牌
 * 每 5 秒推送一次未读消息数变化；比 WebSocket 轻量，足够站内通知场景。
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.get('/stream', (req, res) => {
  let payload;
  try {
    payload = jwt.verify(String(req.query.token || ''), JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: '无效令牌' });
  }

  const userId = payload.id;
  // 黑名单检查与 auth 中间件一致
  const blacklisted = db.prepare('SELECT id FROM token_blacklist WHERE jti = ?').get(payload.jti || '');
  if (blacklisted) return res.status(401).json({ error: '令牌已失效' });
  // 账户状态校验与 auth 中间件一致（被禁用账号不推送）
  const userRow = db.prepare('SELECT is_disabled FROM users WHERE id = ?').get(userId);
  if (!userRow || userRow.is_disabled) return res.status(403).json({ error: '账户不可用' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write(`event: connected\ndata: {"user_id":${userId}}\n\n`);

  let lastCount = -1;
  const timer = setInterval(() => {
    try {
      const row = db.prepare('SELECT COUNT(*) c FROM messages WHERE to_user_id = ? AND is_read = 0').get(userId);
      if (row.c !== lastCount) {
        lastCount = row.c;
        res.write(`event: unread\ndata: {"count":${row.c}}\n\n`);
      } else {
        res.write(': ping\n\n');
      }
    } catch (e) { /* 连接中断忽略 */ }
  }, 5000);

  req.on('close', () => clearInterval(timer));
});

module.exports = router;
