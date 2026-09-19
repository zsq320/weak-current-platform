// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 合同路由（电子合同 + 资金托管结算）
 * API 前缀: /api/contracts
 *
 * 说明：
 * - 合同正文由平台模板生成，双方在页面上确认后用登录密码完成签署动作，
 *   签署记录带内容哈希 + IP + 时间戳留痕。该流程具备证据链但不具备《电子签名法》
 *   意义上的可靠电子签名效力，正式商用需对接 CA 数字证书服务（e签宝/法大大等，见 docs/COMMERCIAL.md）。
 * - 结算走资金账本：完工时甲方付工程款 -> 平台抽佣 -> 工程师到账 -> 质保金留存到期释放。
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const bcryptjs = require('bcryptjs');
const { postLedger, recordPlatformIncome, getNumberSetting } = require('../utils/ledger');

const router = express.Router();
router.use(authMiddleware);

function contentHash(content, version) {
  return crypto.createHash('sha256').update(`${version}\n${content}`).digest('hex');
}

function resolveProjectTitle(contract, project) {
  return (project && project.title) || contract.project_title || contract.title || '（工程名称待补充）';
}

function buildContractContent(contract, project) {
  const commissionRate = contract.commission_rate != null ? contract.commission_rate : getNumberSetting('commission_rate', 5);
  const retentionRate = contract.retention_rate != null ? contract.retention_rate : getNumberSetting('retention_rate', 5);
  const warrantyMonths = contract.warranty_months != null ? contract.warranty_months : getNumberSetting('warranty_months', 12);
  const owner = db.prepare('SELECT real_name, username FROM users WHERE id = ?').get(contract.owner_id);
  const engineer = db.prepare('SELECT real_name, username FROM users WHERE id = ?').get(contract.engineer_id);

  return `弱电工程服务合同（平台见证版）

甲方（发包方）：${owner.real_name || owner.username}
乙方（承包方）：${engineer.real_name || engineer.username}
工程名称：${resolveProjectTitle(contract, project)}
工程地点：${project.location || '以工程描述为准'}
合同金额：人民币 ${contract.amount} 元（大写以双方线下约定为准）

第一条 工程内容
以本平台工程详情页发布的需求描述及双方在平台内的沟通记录为准，乙方按约定完成施工。

第二条 价款与支付
1. 甲方通过平台完成工程款支付/托管；
2. 平台按成交金额的 ${commissionRate}% 收取平台服务费；
3. 结算时按成交金额的 ${retentionRate}% 留存质保金，质保期 ${warrantyMonths} 个月，期满无质量问题后由平台释放给乙方。

第三条 工期与验收
1. 工期以中标投标文件的承诺为准；
2. 乙方应在平台记录施工日志、上传施工照片，隐蔽工程须留存验收记录；
3. 工程完工后由甲方在平台发起/确认竣工验收；甲方收到竣工验收申请后应在合理期限内验收，逾期未提出异议的视为验收合格。

第四条 质量与保修
1. 乙方对施工质量负责，验收不合格的应按甲方整改意见返工；
2. 质保期内出现质量问题的，乙方应通过平台质保工单及时维修。

第五条 违约与争议
1. 任何一方违约给对方造成损失的，应承担赔偿责任；
2. 双方发生争议的，可提交平台纠纷仲裁，平台有权依据平台内记录（聊天、打卡、日志、照片、验收单）作出处理意见；协商不成的，依法向有管辖权的人民法院起诉。

第六条 其他
1. 本合同自双方在平台完成签署动作后生效；
2. 平台仅提供信息撮合、过程见证与资金代管服务，不是施工任务的实施主体；
3. 本合同一式两份，双方各执一份（平台存档电子版）。

甲方签署：________________    乙方签署：________________
签署时间以平台签署记录为准
`;
}

// 获取我的合同
router.get('/my', (req, res) => {
  const contracts = db.prepare(`
    SELECT c.*, p.title as project_title, p.category,
      u1.username as owner_name, u1.real_name as owner_real_name,
      u2.username as engineer_name, u2.real_name as engineer_real_name
    FROM contracts c
    JOIN projects p ON c.project_id = p.id
    JOIN users u1 ON c.owner_id = u1.id
    JOIN users u2 ON c.engineer_id = u2.id
    WHERE c.owner_id = ? OR c.engineer_id = ?
    ORDER BY c.signed_at DESC
  `).all(req.user.id, req.user.id);
  res.json(contracts);
});

// 合同详情（含正文与签署记录）
router.get('/:id', (req, res) => {
  const contract = db.prepare(`
    SELECT c.*, p.title as project_title, p.location, p.description as project_desc,
      u1.username as owner_name, u1.real_name as owner_real_name,
      u2.username as engineer_name, u2.real_name as engineer_real_name
    FROM contracts c
    JOIN projects p ON c.project_id = p.id
    JOIN users u1 ON c.owner_id = u1.id
    JOIN users u2 ON c.engineer_id = u2.id
    WHERE c.id = ?
  `).get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  if (contract.owner_id !== req.user.id && contract.engineer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权查看' });
  }

  // 兼容旧合同：无正文或标题缺失时按模板补生成
  if (!contract.content || contract.content.includes('工程名称：undefined')) {
    const content = buildContractContent(contract, contract);
    const version = contract.content_version || 1;
    db.prepare('UPDATE contracts SET content = ?, content_hash = ? WHERE id = ?')
      .run(content, contentHash(content, version), contract.id);
    contract.content = content;
    contract.content_hash = contentHash(content, version);
  }

  const signatures = db.prepare(`
    SELECT s.*, u.username, u.real_name FROM contract_signatures s
    JOIN users u ON s.user_id = u.id WHERE s.contract_id = ? ORDER BY s.id ASC
  `).all(contract.id);
  const warranties = db.prepare('SELECT * FROM warranty_tickets WHERE contract_id = ? ORDER BY id DESC').all(contract.id);
  const dispute = db.prepare("SELECT * FROM disputes WHERE contract_id = ? AND status != 'closed' ORDER BY id DESC").get(contract.id);

  res.json({ contract, signatures, warranties, dispute });
});

// 修改合同正文（仅甲方，且双方均未签署时）
router.put('/:id/content', (req, res) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  if (contract.owner_id !== req.user.id) return res.status(403).json({ error: '只有甲方可以修改合同条款' });
  if (contract.owner_signed_at || contract.engineer_signed_at) {
    return res.status(400).json({ error: '合同已进入签署流程，不能修改正文；如需变更请终止后重新签订' });
  }

  const content = String(req.body.content || '').trim();
  if (content.length < 50) return res.status(400).json({ error: '合同正文太短（至少50字符）' });
  const version = (contract.content_version || 1) + 1;
  db.prepare('UPDATE contracts SET content = ?, content_version = ?, content_hash = ? WHERE id = ?')
    .run(content, version, contentHash(content, version), contract.id);
  logAudit(req.user.id, 'update_contract_content', 'contract', contract.id, { version }, req.ip);
  res.json({ message: '合同正文已更新' });
});

// 签署合同（需登录密码确认）
router.post('/:id/sign', (req, res) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  if (contract.status !== 'active') return res.status(400).json({ error: '合同状态不允许签署' });

  const role = req.user.id === contract.owner_id ? 'owner'
    : req.user.id === contract.engineer_id ? 'engineer' : null;
  if (!role) return res.status(403).json({ error: '仅合同双方可以签署' });
  if (role === 'owner' && contract.owner_signed_at) return res.status(400).json({ error: '您已签署过本合同' });
  if (role === 'engineer' && contract.engineer_signed_at) return res.status(400).json({ error: '您已签署过本合同' });

  const { password, escrow } = req.body;
  const user = db.prepare('SELECT password_hash, balance FROM users WHERE id = ?').get(req.user.id);
  if (!password || !bcryptjs.compareSync(String(password), user.password_hash)) {
    return res.status(400).json({ error: '登录密码不正确' });
  }

  const content = contract.content || buildContractContent(contract, contract);
  const version = contract.content_version || 1;
  const hash = contentHash(content, version);

  const signTx = db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO contract_signatures (contract_id, user_id, role, content_version, content_hash, ip) VALUES (?, ?, ?, ?, ?, ?)')
      .run(contract.id, req.user.id, role, version, hash, req.ip);
    if (role === 'owner') {
      db.prepare("UPDATE contracts SET owner_signed_at = CURRENT_TIMESTAMP, content = ?, content_hash = ? WHERE id = ?")
        .run(content, hash, contract.id);
    } else {
      db.prepare("UPDATE contracts SET engineer_signed_at = CURRENT_TIMESTAMP, content = ?, content_hash = ? WHERE id = ?")
        .run(content, hash, contract.id);
    }

    // 双方都签完 -> 签署完成
    const after = db.prepare('SELECT owner_signed_at, engineer_signed_at FROM contracts WHERE id = ?').get(contract.id);
    if (after.owner_signed_at && after.engineer_signed_at) {
      db.prepare("UPDATE contracts SET sign_status = 'signed' WHERE id = ?").run(contract.id);
    } else {
      db.prepare("UPDATE contracts SET sign_status = 'partial' WHERE id = ?").run(contract.id);
    }

    // 甲方签署时选择托管：立即冻结工程款
    if (role === 'owner' && escrow && contract.escrow_status !== 'frozen') {
      postLedger({
        userId: req.user.id,
        amount: -contract.amount,
        type: 'pay_escrow',
        refType: 'contract',
        refId: contract.id,
        remark: `工程款托管（合同#${contract.id}）`
      });
      db.prepare("UPDATE contracts SET escrow_status = 'frozen' WHERE id = ?").run(contract.id);
    }
  });

  try {
    signTx();
  } catch (err) {
    return res.status(err.code === 'INSUFFICIENT_BALANCE' ? 400 : 500)
      .json({ error: err.code === 'INSUFFICIENT_BALANCE' ? err.message : '签署失败' });
  }

  const otherId = role === 'owner' ? contract.engineer_id : contract.owner_id;
  db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, otherId, '合同签署通知',
    role === 'owner' ? '甲方已签署合同，请您及时在合同管理中确认签署。' : '乙方已签署合同。', 'contract'
  );
  logAudit(req.user.id, 'sign_contract', 'contract', contract.id, { role, escrow: !!escrow }, req.ip);
  res.json({ message: '签署成功', content_hash: hash });
});

// 确认完工（资金托管结算：工程款 -> 佣金 -> 工程师 -> 质保金留存）
router.post('/:id/complete', (req, res) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  if (contract.owner_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (contract.status !== 'active') return res.status(400).json({ error: '合同状态不允许此操作' });

  // 可配置：竣工必须先有验收通过的竣工验收单（默认关闭，正式运营建议开启）
  if (String(getNumberSetting('require_final_acceptance', 0)) === '1') {
    const finalOk = db.prepare("SELECT id FROM acceptances WHERE project_id = ? AND type = 'final' AND status = 'approved'")
      .get(contract.project_id);
    if (!finalOk) return res.status(400).json({ error: '尚未存在验收通过的竣工验收单，无法完工结算' });
  }
  if (String(getNumberSetting('require_both_signatures', 0)) === '1' && (!contract.owner_signed_at || !contract.engineer_signed_at)) {
    return res.status(400).json({ error: '合同尚未完成双方签署' });
  }

  const commissionRate = contract.commission_rate != null ? contract.commission_rate : getNumberSetting('commission_rate', 5);
  const retentionRate = contract.retention_rate != null ? contract.retention_rate : getNumberSetting('retention_rate', 5);
  const warrantyMonths = contract.warranty_months != null ? contract.warranty_months : getNumberSetting('warranty_months', 12);
  const commission = Math.round(contract.amount * commissionRate) / 100;
  const retention = Math.round(contract.amount * retentionRate) / 100;
  const toEngineer = Math.round((contract.amount - commission - retention) * 100) / 100;

  const settleTx = db.transaction(() => {
    // 托管已冻结：直接释放；否则从甲方余额现扣
    if (contract.escrow_status === 'frozen') {
      postLedger({ userId: contract.owner_id, amount: contract.amount, type: 'release_escrow', refType: 'contract', refId: contract.id, remark: `托管释放用于结算（合同#${contract.id}）` });
      // 释放后余额增加，再扣回
      postLedger({ userId: contract.owner_id, amount: -contract.amount, type: 'settlement', refType: 'contract', refId: contract.id, remark: `工程款结算支出（合同#${contract.id}）` });
    } else {
      postLedger({ userId: contract.owner_id, amount: -contract.amount, type: 'settlement', refType: 'contract', refId: contract.id, remark: `工程款结算支出（合同#${contract.id}）` });
    }
    postLedger({ userId: contract.engineer_id, amount: toEngineer, type: 'settlement', refType: 'contract', refId: contract.id, remark: `工程款结算到账（已扣平台服务费${commission}元、质保金${retention}元）` });
    if (commission > 0) recordPlatformIncome({ type: 'commission', amount: commission, refType: 'contract', refId: contract.id, remark: `平台服务费（合同#${contract.id}）` });
    if (retention > 0) recordPlatformIncome({ type: 'retention', amount: retention, refType: 'contract', refId: contract.id, remark: `质保金留存（合同#${contract.id}，质保${warrantyMonths}个月）` });

    db.prepare(`UPDATE contracts SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
      escrow_status = 'settled', commission_rate = ?, retention_rate = ?, retention_amount = ?, warranty_months = ? WHERE id = ?`)
      .run(commissionRate, retentionRate, retention, warrantyMonths, contract.id);
    db.prepare("UPDATE projects SET status = 'completed' WHERE id = ?").run(contract.project_id);

    const project = db.prepare('SELECT title FROM projects WHERE id = ?').get(contract.project_id);
    db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, contract.engineer_id, '工程已完工结算',
      `工程「${project.title}」已确认完工结算，${toEngineer} 元已到账（另有 ${retention} 元质保金于 ${warrantyMonths} 个月后释放）。`, 'contract'
    );
  });

  try {
    settleTx();
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: err.message });
    console.error('合同结算失败:', err);
    return res.status(500).json({ error: '结算失败，请稍后重试' });
  }

  logAudit(req.user.id, 'complete_contract', 'contract', contract.id, { commission, retention }, req.ip);
  res.json({ message: '工程已确认完工，款项已结算', commission, retention, to_engineer: toEngineer });
});

// 终止合同（已托管资金退回甲方）
router.post('/:id/terminate', (req, res) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  if (contract.owner_id !== req.user.id && contract.engineer_id !== req.user.id) {
    return res.status(403).json({ error: '无权操作' });
  }
  if (contract.status !== 'active') return res.status(400).json({ error: '合同状态不允许此操作' });

  const terminateTx = db.transaction(() => {
    if (contract.escrow_status === 'frozen') {
      postLedger({ userId: contract.owner_id, amount: contract.amount, type: 'release_escrow', refType: 'contract', refId: contract.id, remark: `合同终止，托管资金退回（合同#${contract.id}）` });
    }
    db.prepare("UPDATE contracts SET status = 'terminated', escrow_status = CASE WHEN escrow_status = 'frozen' THEN 'refunded' ELSE escrow_status END WHERE id = ?").run(contract.id);
    db.prepare("UPDATE projects SET status = 'cancelled' WHERE id = ?").run(contract.project_id);
    const otherUserId = req.user.id === contract.owner_id ? contract.engineer_id : contract.owner_id;
    db.prepare('INSERT INTO messages (from_user_id, to_user_id, title, content, type) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, otherUserId, '合同已终止', '合同已被终止，如有托管资金已退回甲方账户。', 'contract'
    );
  });

  terminateTx();
  logAudit(req.user.id, 'terminate_contract', 'contract', contract.id, null, req.ip);
  res.json({ message: '合同已终止' });
});

module.exports = router;
