// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 资金中心路由
 * API 前缀: /api/finance
 *
 * 充值渠道说明：
 * - 未配置 PAYMENT_GATEWAY 时走平台内部记账通道（立即入账，仅用于演示/联调），
 *   任何真实收款必须配置支付网关（微信支付/支付宝/对公转账人工确认），见 docs/COMMERCIAL.md。
 * - 已配置网关时：创建订单 -> 跳转支付 -> 回调验签入账（回调入口: POST /api/finance/deposit/notify）。
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { postLedger, getSetting, getNumberSetting } = require('../utils/ledger');

const router = express.Router();
router.use(authMiddleware);

const GATEWAY = process.env.PAYMENT_GATEWAY || 'mock';

function genOrderNo() {
  return `D${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}${crypto.randomInt(1000, 9999)}`;
}

/** 创建充值订单 */
router.post('/deposit/orders', (req, res) => {
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: '充值金额无效' });
  if (amount > 100000) return res.status(400).json({ error: '单次充值金额不能超过10万元' });

  const orderNo = genOrderNo();
  db.prepare('INSERT INTO deposit_orders (order_no, user_id, amount, channel) VALUES (?, ?, ?, ?)')
    .run(orderNo, req.user.id, amount, GATEWAY);
  logAudit(req.user.id, 'create_deposit_order', 'deposit_order', orderNo, { amount, channel: GATEWAY }, req.ip);

  const order = db.prepare('SELECT * FROM deposit_orders WHERE order_no = ?').get(orderNo);
  res.status(201).json({
    order,
    pay_url: GATEWAY === 'mock' ? null : process.env.PAYMENT_PAY_URL || null,
    message: GATEWAY === 'mock'
      ? '当前为平台内部充值通道，确认后立即入账'
      : '请通过 pay_url 完成支付，支付成功后由回调入账'
  });
});

/** mock 通道：确认支付（真实网关场景由回调验签后调用同一入账函数） */
router.post('/deposit/orders/:orderNo/confirm', (req, res) => {
  const order = db.prepare('SELECT * FROM deposit_orders WHERE order_no = ? AND user_id = ?')
    .get(req.params.orderNo, req.user.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ error: '订单状态不允许支付' });
  if (GATEWAY !== 'mock') return res.status(400).json({ error: '当前配置了真实支付网关，请通过支付页面完成付款' });

  const payOrder = db.transaction(() => {
    db.prepare("UPDATE deposit_orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
    postLedger({
      userId: req.user.id,
      amount: order.amount,
      type: 'deposit',
      refType: 'deposit_order',
      refId: order.id,
      remark: `充值订单 ${order.order_no}（${order.channel}）`,
      operatorId: req.user.id
    });
  });

  try {
    payOrder();
  } catch (err) {
    console.error('充值入账失败:', err);
    return res.status(500).json({ error: err.message || '入账失败' });
  }

  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  logAudit(req.user.id, 'pay_deposit', 'deposit_order', order.id, { amount: order.amount }, req.ip);
  res.json({ balance: user.balance, message: `充值 ${order.amount} 元成功` });
});

// 真实支付网关回调入口（示例骨架，上线时按微信/支付宝规范补验签）
router.post('/deposit/notify', (req, res) => {
  // TODO: 验证平台证书/签名 -> 幂等处理订单 -> postLedger 入账 -> 返回渠道要求的应答
  res.status(501).json({ error: '支付回调需要先完成网关验签配置，见 docs/COMMERCIAL.md' });
});

/** 结算费率（登录即可读，供前端展示确认文案） */
router.get('/rates', (req, res) => {
  res.json({
    commission_rate: getNumberSetting('commission_rate', 5),
    retention_rate: getNumberSetting('retention_rate', 5),
    warranty_months: getNumberSetting('warranty_months', 12)
  });
});

/** 我的资金流水 */
router.get('/ledger', (req, res) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)));
  const total = db.prepare('SELECT COUNT(*) as c FROM ledger WHERE user_id = ?').get(req.user.id).c;
  const items = db.prepare('SELECT * FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(req.user.id, pageSize, (page - 1) * pageSize);
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ items, total, page, pageSize, balance: user ? user.balance : 0 });
});

/** 平台入账流水（佣金/质保金，仅管理员对账用） */
router.get('/platform-income', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可查看平台对账数据' });
  const rows = db.prepare(`
    SELECT type, SUM(amount) as total, COUNT(*) as count
    FROM ledger WHERE user_id IS NULL GROUP BY type
  `).all();
  res.json({ items: rows });
});

/** 申请提现（余额先冻结，管理员审核通过打款 / 驳回退回） */
router.post('/withdrawals', (req, res) => {
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const bankInfo = String(req.body.bank_info || '').trim().slice(0, 300);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: '提现金额无效' });
  if (amount < 1) return res.status(400).json({ error: '单次提现至少 1 元' });
  if (!bankInfo) return res.status(400).json({ error: '请填写收款银行卡/账户信息' });

  const applyWithdraw = db.transaction(() => {
    postLedger({
      userId: req.user.id,
      amount: -amount,
      type: 'withdraw',
      refType: 'withdrawal',
      remark: '提现申请，余额冻结待审核'
    });
    db.prepare('INSERT INTO withdrawal_requests (user_id, amount, bank_info) VALUES (?, ?, ?)')
      .run(req.user.id, amount, bankInfo);
  });

  try {
    applyWithdraw();
  } catch (err) {
    return res.status(err.code === 'INSUFFICIENT_BALANCE' ? 400 : 500).json({ error: err.message });
  }
  logAudit(req.user.id, 'apply_withdrawal', 'withdrawal', null, { amount }, req.ip);
  res.status(201).json({ message: '提现申请已提交，等待平台审核' });
});

/** 我的提现记录 */
router.get('/withdrawals', (req, res) => {
  const items = db.prepare(`
    SELECT w.*, u.username FROM withdrawal_requests w
    JOIN users u ON w.user_id = u.id
    WHERE w.user_id = ? ORDER BY w.id DESC LIMIT 50
  `).all(req.user.id);
  res.json({ items });
});

/** 质保金到期列表（甲方或工程师可查自己的） */
router.get('/retentions', (req, res) => {
  const items = db.prepare(`
    SELECT c.id, c.project_id, p.title, c.engineer_id, c.owner_id, c.retention_amount,
           c.warranty_months, c.completed_at, c.retention_released_at,
           datetime(c.completed_at, '+' || c.warranty_months || ' months') as release_due
    FROM contracts c JOIN projects p ON c.project_id = p.id
    WHERE c.retention_amount > 0 AND c.retention_released_at IS NULL AND c.status = 'completed'
      AND (c.owner_id = ? OR c.engineer_id = ?)
  `).all(req.user.id, req.user.id);
  res.json({ items });
});

module.exports = router;
