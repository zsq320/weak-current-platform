// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 资金账本服务：所有余额变动必须经由这里，保证「余额 + 流水」原子一致。
 * 上线真实支付时，只需替换 deposit/orders 的渠道层，账本逻辑不变。
 */

const db = require('../db');

/** 读取平台设置 */
function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row !== undefined ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP')
    .run(key, String(value));
}

function getNumberSetting(key, fallback) {
  const v = Number(getSetting(key, fallback));
  return Number.isFinite(v) ? v : fallback;
}

/**
 * 原子变更余额并写入流水（必须在 db.transaction 内调用）
 * @param {object} opts
 * @param {number} opts.userId
 * @param {number} opts.amount 正数加钱、负数扣钱
 * @param {string} opts.type ledger.type
 * @param {string} [opts.refType]
 * @param {number} [opts.refId]
 * @param {string} [opts.remark]
 * @param {number} [opts.operatorId]
 */
function postLedger({ userId, amount, type, refType, refId, remark, operatorId }) {
  const num = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(num) || num === 0) {
    throw new Error('账本金额无效');
  }

  const user = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('账本用户不存在');

  const balanceAfter = Math.round((Number(user.balance) + num) * 100) / 100;
  if (balanceAfter < 0 && num < 0) {
    const err = new Error(`余额不足，需要 ${Math.abs(num)} 元，当前余额 ${user.balance} 元`);
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balanceAfter, userId);
  db.prepare(`
    INSERT INTO ledger (user_id, type, amount, balance_after, ref_type, ref_id, remark, operator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, type, num, balanceAfter, refType || null, refId || null, remark || null, operatorId || null);

  return balanceAfter;
}

/** 生成的平台抽佣/质保金不走用户余额，仅记账（平台收入由对账报表汇总） */
function recordPlatformIncome({ type, amount, refType, refId, remark }) {
  db.prepare(`
    INSERT INTO ledger (user_id, type, amount, balance_after, ref_type, ref_id, remark)
    VALUES (NULL, ?, ?, NULL, ?, ?, ?)
  `).run(type, amount, refType || null, refId || null, remark || null);
}

module.exports = { postLedger, recordPlatformIncome, getSetting, setSetting, getNumberSetting };
