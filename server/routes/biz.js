// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 商用化综合业务路由
 * API 前缀: /api/biz
 *
 * 质保工单 / 发票申请 / 纠纷投诉 / 评价申诉 / 企业认证 / 项目聊天 / 协议
 */

const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// 协议文档公开可读（登录前也要能查看）
router.get('/agreements/:type', (req, res) => {
  const type = ['user_agreement', 'privacy'].includes(req.params.type) ? req.params.type : 'user_agreement';
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', 'legal', `${type}.md`);
  let content = '';
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (e) {
    content = `# 文档缺失\n\n请联系平台管理员补充 ${type} 文档。`;
  }
  res.json({ type, content, version: '1.0' });
});

router.use(authMiddleware);

function getContractWithAccess(req, contractId) {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(Number(contractId));
  if (!contract) return { error: '合同不存在', code: 404 };
  if (contract.owner_id !== req.user.id && contract.engineer_id !== req.user.id && req.user.role !== 'admin') {
    return { error: '无权操作', code: 403 };
  }
  return { contract };
}

// ============ 质保工单 ============
router.get('/warranties', (req, res) => {
  const role = req.user.role === 'admin' ? 'all' : 'mine';
  const base = `
    SELECT w.*, p.title as project_title, u.username as reporter_name
    FROM warranty_tickets w
    JOIN projects p ON w.project_id = p.id
    JOIN users u ON w.user_id = u.id
  `;
  const items = role === 'all'
    ? db.prepare(`${base} ORDER BY w.id DESC LIMIT 100`).all()
    : db.prepare(`
        ${base}
        WHERE w.user_id = ? OR w.project_id IN (
          SELECT project_id FROM contracts WHERE owner_id = ? OR engineer_id = ?
        )
        ORDER BY w.id DESC LIMIT 100
      `).all(req.user.id, req.user.id, req.user.id);
  res.json({ items });
});

router.post('/warranties', (req, res) => {
  const { project_id, title, description } = req.body;
  const pid = Number(project_id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
  if (!project) return res.status(404).json({ error: '工程不存在' });

  const contract = db.prepare("SELECT * FROM contracts WHERE project_id = ? AND status = 'completed'").get(pid);
  if (project.user_id !== req.user.id) return res.status(403).json({ error: '仅工程发布方可以报修' });
  if (!contract) return res.status(400).json({ error: '该工程尚未完成结算，请通过纠纷通道处理' });
  if (contract.retention_released_at) return res.status(400).json({ error: '质保期已结束' });

  if (!title || !String(title).trim()) return res.status(400).json({ error: '请填写报修标题' });
  const result = db.prepare('INSERT INTO warranty_tickets (project_id, contract_id, user_id, title, description) VALUES (?, ?, ?, ?, ?)')
    .run(pid, contract.id, req.user.id, String(title).trim(), description || null);
  logAudit(req.user.id, 'create_warranty', 'warranty_ticket', result.lastInsertRowid, { project_id: pid }, req.ip);
  res.status(201).json({ message: '报修工单已提交', id: result.lastInsertRowid });
});

// 质保工单状态流转：open --工程师接单--> processing --工程师完成--> resolved --甲方确认--> closed
function getWarrantyWithAccess(req, id) {
  const w = db.prepare('SELECT * FROM warranty_tickets WHERE id = ?').get(Number(id));
  if (!w) return { error: '工单不存在', code: 404 };
  const contract = w.contract_id ? db.prepare('SELECT * FROM contracts WHERE id = ?').get(w.contract_id) : null;
  const isOwner = contract && contract.owner_id === req.user.id;
  const isEngineer = contract && contract.engineer_id === req.user.id;
  if (!isOwner && !isEngineer && req.user.role !== 'admin') return { error: '无权操作', code: 403 };
  return { w, isOwner, isEngineer };
}

// 工程师接单（报修响应）
router.post('/warranties/:id/accept', (req, res) => {
  const { w, isEngineer, error, code } = getWarrantyWithAccess(req, req.params.id);
  if (error) return res.status(code).json({ error });
  if (!isEngineer) return res.status(403).json({ error: '仅质保责任工程师可接单' });
  if (w.status !== 'open') return res.status(400).json({ error: '工单状态不允许接单' });
  db.prepare("UPDATE warranty_tickets SET status = 'processing' WHERE id = ?").run(w.id);
  logAudit(req.user.id, 'warranty_accept', 'warranty_ticket', w.id, null, req.ip);
  res.json({ message: '已接单，请尽快安排维修' });
});

// 工程师完成维修
router.post('/warranties/:id/resolve', (req, res) => {
  const { w, isEngineer, error, code } = getWarrantyWithAccess(req, req.params.id);
  if (error) return res.status(code).json({ error });
  if (!isEngineer) return res.status(403).json({ error: '仅质保责任工程师可完成处理' });
  if (w.status !== 'processing') return res.status(400).json({ error: '请先接单再完成处理' });
  const { handle_note } = req.body;
  if (!handle_note || !String(handle_note).trim()) return res.status(400).json({ error: '请填写维修处理说明' });
  db.prepare("UPDATE warranty_tickets SET status = 'resolved', handle_note = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(String(handle_note).trim(), w.id);
  logAudit(req.user.id, 'warranty_resolve', 'warranty_ticket', w.id, null, req.ip);
  res.json({ message: '维修已完成，等待甲方确认关闭' });
});

// 甲方确认关闭
router.post('/warranties/:id/close', (req, res) => {
  const { w, isOwner, error, code } = getWarrantyWithAccess(req, req.params.id);
  if (error) return res.status(code).json({ error });
  if (!isOwner) return res.status(403).json({ error: '仅报修方（甲方）可确认关闭' });
  if (w.status !== 'resolved') return res.status(400).json({ error: '工单未完成维修，无法关闭' });
  db.prepare("UPDATE warranty_tickets SET status = 'closed' WHERE id = ?").run(w.id);
  logAudit(req.user.id, 'warranty_close', 'warranty_ticket', w.id, null, req.ip);
  res.json({ message: '工单已关闭' });
});

// ============ 发票申请 ============
router.get('/invoices', (req, res) => {
  const items = req.user.role === 'admin'
    ? db.prepare(`SELECT i.*, u.username FROM invoices i JOIN users u ON i.user_id = u.id ORDER BY i.id DESC LIMIT 100`).all()
    : db.prepare(`SELECT i.*, u.username FROM invoices i JOIN users u ON i.user_id = u.id WHERE i.user_id = ? ORDER BY i.id DESC LIMIT 100`).all(req.user.id);
  res.json({ items });
});

router.post('/invoices', (req, res) => {
  const { contract_id, title_type, title, tax_no, amount, invoice_type } = req.body;
  if (!['personal', 'company'].includes(title_type)) return res.status(400).json({ error: '抬头类型无效' });
  if (!title || !String(title).trim()) return res.status(400).json({ error: '请填写发票抬头' });
  if (title_type === 'company' && !/^[A-Z0-9]{15,20}$/.test(String(tax_no || '').toUpperCase())) {
    return res.status(400).json({ error: '企业抬头需要有效的纳税人识别号' });
  }
  const amountNum = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amountNum) || amountNum <= 0) return res.status(400).json({ error: '开票金额无效' });

  let contractId = null;
  if (contract_id) {
    const { contract, error, code } = getContractWithAccess(req, contract_id);
    if (error) return res.status(code).json({ error });
    if (contract.status !== 'completed') return res.status(400).json({ error: '合同未完成结算，暂不能开票' });
    // 累计开票（待审+已审+已开）不得超过合同金额
    const prev = db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE contract_id = ? AND status IN ('pending','approved','issued')").get(contract.id).s;
    if (Math.round((prev + amountNum) * 100) / 100 > contract.amount + 0.001) {
      return res.status(400).json({ error: `累计开票金额将达 ${(prev + amountNum).toFixed(2)} 元，超过合同金额 ${contract.amount} 元` });
    }
    contractId = contract.id;
  }

  const result = db.prepare(`
    INSERT INTO invoices (user_id, contract_id, title_type, title, tax_no, amount, invoice_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, contractId, title_type, String(title).trim(),
    title_type === 'company' ? String(tax_no).toUpperCase() : null, amountNum,
    invoice_type === 'special' ? 'special' : 'normal');
  logAudit(req.user.id, 'apply_invoice', 'invoice', result.lastInsertRowid, { amount: amountNum }, req.ip);
  res.status(201).json({ message: '发票申请已提交，等待平台处理', id: result.lastInsertRowid });
});

// ============ 纠纷/投诉 ============
router.get('/disputes', (req, res) => {
  const items = req.user.role === 'admin'
    ? db.prepare(`
        SELECT d.*, u.username as reporter_name, a.username as against_name, p.title as project_title
        FROM disputes d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN users a ON d.against_user_id = a.id
        LEFT JOIN projects p ON d.project_id = p.id
        ORDER BY CASE d.status WHEN 'open' THEN 0 WHEN 'arbitrating' THEN 1 ELSE 2 END, d.id DESC LIMIT 100
      `).all()
    : db.prepare(`
        SELECT d.*, u.username as reporter_name, a.username as against_name, p.title as project_title
        FROM disputes d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN users a ON d.against_user_id = a.id
        LEFT JOIN projects p ON d.project_id = p.id
        WHERE d.user_id = ? OR d.against_user_id = ?
          OR d.contract_id IN (SELECT id FROM contracts WHERE owner_id = ? OR engineer_id = ?)
        ORDER BY d.id DESC LIMIT 100
      `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  res.json({ items });
});

router.post('/disputes', (req, res) => {
  const { project_id, contract_id, against_user_id, reason, description } = req.body;
  if (!reason || !String(reason).trim()) return res.status(400).json({ error: '请填写纠纷事由' });

  let contractId = null;
  let againstId = against_user_id ? Number(against_user_id) : null;
  if (contract_id) {
    const { contract, error, code } = getContractWithAccess(req, contract_id);
    if (error) return res.status(code).json({ error });
    contractId = contract.id;
    againstId = againstId || (req.user.id === contract.owner_id ? contract.engineer_id : contract.owner_id);
  }
  if (!contractId && !project_id) return res.status(400).json({ error: '请关联工程或合同' });

  const result = db.prepare(`
    INSERT INTO disputes (user_id, project_id, contract_id, against_user_id, reason, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, project_id ? Number(project_id) : null, contractId, againstId,
    String(reason).trim(), description || null);
  logAudit(req.user.id, 'create_dispute', 'dispute', result.lastInsertRowid, { contract_id: contractId }, req.ip);
  res.status(201).json({ message: '投诉已提交，平台将介入处理', id: result.lastInsertRowid });
});

// ============ 评价申诉 ============
router.get('/review-appeals', (req, res) => {
  const items = db.prepare(`
    SELECT ra.*, r.rating, r.comment as review_comment, u.username as appellant_name
    FROM review_appeals ra
    JOIN reviews r ON ra.review_id = r.id
    JOIN users u ON ra.user_id = u.id
    WHERE ra.user_id = ? ORDER BY ra.id DESC LIMIT 50
  `).all(req.user.id);
  res.json({ items });
});

router.post('/review-appeals', (req, res) => {
  const { review_id, reason } = req.body;
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(Number(review_id));
  if (!review) return res.status(404).json({ error: '评价不存在' });
  if (review.to_user_id !== req.user.id) return res.status(403).json({ error: '只能申诉针对自己的评价' });
  if (!reason || !String(reason).trim()) return res.status(400).json({ error: '请填写申诉理由' });

  const dup = db.prepare("SELECT id FROM review_appeals WHERE review_id = ? AND user_id = ? AND status = 'pending'").get(review.id, req.user.id);
  if (dup) return res.status(400).json({ error: '该评价已有待处理的申诉' });

  const result = db.prepare('INSERT INTO review_appeals (review_id, user_id, reason) VALUES (?, ?, ?)')
    .run(review.id, req.user.id, String(reason).trim());
  res.status(201).json({ message: '申诉已提交，等待平台审核', id: result.lastInsertRowid });
});

// ============ 企业认证 ============
router.get('/company', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE user_id = ?').get(req.user.id);
  res.json({ company: company || null });
});

router.post('/company', (req, res) => {
  const existing = db.prepare('SELECT * FROM companies WHERE user_id = ?').get(req.user.id);
  if (existing && existing.status === 'pending') return res.status(400).json({ error: '企业认证审核中，请耐心等待' });
  if (existing && existing.status === 'approved') return res.status(400).json({ error: '企业认证已通过' });

  const { company_name, license_no, qualification_level, qualification_no, license_image } = req.body;
  if (!company_name || !String(company_name).trim()) return res.status(400).json({ error: '请填写企业名称' });
  if (!/^[0-9A-HJ-NP-RTUWXY]{18}$/.test(String(license_no || '').toUpperCase())) {
    return res.status(400).json({ error: '统一社会信用代码格式不正确（18位）' });
  }

  if (existing) {
    db.prepare(`
      UPDATE companies SET company_name = ?, license_no = ?, qualification_level = ?, qualification_no = ?,
        license_image = ?, status = 'pending', reject_reason = NULL, applied_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).run(String(company_name).trim(), String(license_no).toUpperCase(), qualification_level || null,
      qualification_no || null, license_image || null, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO companies (user_id, company_name, license_no, qualification_level, qualification_no, license_image)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, String(company_name).trim(), String(license_no).toUpperCase(), qualification_level || null,
      qualification_no || null, license_image || null);
  }
  logAudit(req.user.id, 'apply_company_cert', 'company', req.user.id, { company_name }, req.ip);
  res.status(201).json({ message: '企业认证申请已提交，等待平台审核' });
});

// ============ 项目聊天（双方沟通留痕） ============
function getChatContext(req, projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(projectId));
  if (!project) return { error: '工程不存在', code: 404 };
  const isOwner = project.user_id === req.user.id || req.user.role === 'admin';
  const accepted = db.prepare("SELECT engineer_id FROM bids WHERE project_id = ? AND status = 'accepted'").get(project.id);
  const isWonEngineer = accepted && accepted.engineer_id === req.user.id;
  if (!isOwner && !isWonEngineer) {
    const hasBid = db.prepare('SELECT id FROM bids WHERE project_id = ? AND engineer_id = ?').get(project.id, req.user.id);
    if (!hasBid) return { error: '无权访问该工程的沟通渠道', code: 403 };
  }
  return { project, peerId: isOwner ? (accepted ? accepted.engineer_id : null) : project.user_id, role: isOwner ? 'owner' : 'engineer' };
}

router.get('/projects/:projectId/chat', (req, res) => {
  const ctx = getChatContext(req, req.params.projectId);
  if (ctx.error) return res.status(ctx.code).json({ error: ctx.error });
  const afterId = Math.floor(Number(req.query.after_id) || 0);
  // 只返回与当前用户相关的消息（我是发送方或接收方），
  // 防止未中标的投标方看到甲方与其他投标方的沟通内容
  const items = db.prepare(`
    SELECT c.*, u.username, u.real_name FROM chat_messages c
    JOIN users u ON c.from_user_id = u.id
    WHERE c.project_id = ? AND c.id > ?
      AND (c.from_user_id = ? OR c.to_user_id = ?)
    ORDER BY c.id ASC LIMIT 200
  `).all(ctx.project.id, afterId, req.user.id, req.user.id);
  if (items.length > 0 && ctx.peerId) {
    db.prepare('UPDATE chat_messages SET is_read = 1 WHERE project_id = ? AND to_user_id = ? AND is_read = 0')
      .run(ctx.project.id, req.user.id);
  }
  res.json({ items, peer_id: ctx.peerId });
});

router.post('/projects/:projectId/chat', (req, res) => {
  const ctx = getChatContext(req, req.params.projectId);
  if (ctx.error) return res.status(ctx.code).json({ error: ctx.error });
  if (!ctx.peerId) return res.status(400).json({ error: '该工程还没有中标工程师，无法发起沟通' });
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '消息不能为空' });
  if (content.length > 2000) return res.status(400).json({ error: '单条消息不能超过2000字符' });

  const result = db.prepare('INSERT INTO chat_messages (project_id, from_user_id, to_user_id, content) VALUES (?, ?, ?, ?)')
    .run(ctx.project.id, req.user.id, ctx.peerId, content);
  const msg = db.prepare(`
    SELECT c.*, u.username, u.real_name FROM chat_messages c JOIN users u ON c.from_user_id = u.id WHERE c.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ message: msg });
});

// ============ 协议 ============
// （公开读取接口 /agreements/:type 已在文件顶部、authMiddleware 之前注册，
//   此处仅保留登录用户的签署记录接口，避免重复定义不可达路由）
router.post('/agreements/:type/accept', (req, res) => {
  const type = ['user_agreement', 'privacy'].includes(req.params.type) ? req.params.type : null;
  if (!type) return res.status(400).json({ error: '协议类型无效' });
  db.prepare('INSERT INTO agreement_accepts (user_id, type, ip) VALUES (?, ?, ?)').run(req.user.id, type, req.ip);
  res.json({ message: '已记录协议签署' });
});

module.exports = router;
