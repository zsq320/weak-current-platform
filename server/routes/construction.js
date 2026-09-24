// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 施工过程管理路由
 * API 前缀: /api/projects/:projectId/construction
 *
 * 包含：施工日志 / 现场打卡 / 工程照片 / 隐蔽工程验收 / 材料进场 / 工程量清单BOQ / 阶段与竣工验收 / 工程文件
 * 权限：项目所有者与管理员可管理；中标工程师可提交施工记录；其他登录用户只读。
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router({ mergeParams: true });
router.use(authMiddleware);

// 上传配置（照片/文件）
const uploadRoot = path.join(__dirname, '..', 'uploads', 'construction');
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadRoot),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `c_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|gif|webp|pdf|dwg|dxf|zip|rar|docx?|xlsx?|mp4)$/i.test(file.originalname);
    cb(ok ? null : new Error('不支持的文件类型'), ok);
  }
});

function getProject(req, res) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: '项目不存在' });
    return null;
  }
  return project;
}

function getAcceptedEngineer(projectId) {
  const row = db.prepare("SELECT engineer_id FROM bids WHERE project_id = ? AND status = 'accepted'").get(projectId);
  return row ? row.engineer_id : null;
}

function resolveRole(project, user) {
  if (project.user_id === user.id || user.role === 'admin') return 'owner';
  if (getAcceptedEngineer(project.id) === user.id) return 'engineer';
  return 'viewer';
}

function requireParticipant(req, res) {
  const project = getProject(req, res);
  if (!project) return null;
  const role = resolveRole(project, req.user);
  if (role === 'viewer') {
    res.status(403).json({ error: '仅项目所有者或中标工程师可操作' });
    return null;
  }
  return { project, role };
}

function requireOwner(req, res) {
  const project = getProject(req, res);
  if (!project) return null;
  if (project.user_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: '仅项目所有者可操作' });
    return null;
  }
  return project;
}

const parsePage = (q) => ({
  page: Math.max(1, Math.floor(Number(q.page) || 1)),
  pageSize: Math.min(100, Math.max(1, Math.floor(Number(q.pageSize) || 20)))
});

// ============ 施工日志 ============
// 只读接口同样限制为参与者（owner/中标工程师/管理员），保护打卡定位与施工照片隐私
router.get('/logs', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可查看施工过程数据' });
  const { page, pageSize } = parsePage(req.query);
  const total = db.prepare('SELECT COUNT(*) c FROM construction_logs WHERE project_id = ?').get(project.id).c;
  const items = db.prepare(`
    SELECT l.*, u.username, u.real_name FROM construction_logs l
    JOIN users u ON l.user_id = u.id
    WHERE l.project_id = ? ORDER BY l.log_date DESC, l.id DESC LIMIT ? OFFSET ?
  `).all(project.id, pageSize, (page - 1) * pageSize);
  res.json({ items, total, page, pageSize, role: resolveRole(project, req.user) });
});

router.post('/logs', (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  const { log_date, weather, workers_count, content } = req.body;
  if (!log_date || !/^\d{4}-\d{2}-\d{2}/.test(String(log_date))) return res.status(400).json({ error: '请选择日志日期' });
  if (!content || !String(content).trim()) return res.status(400).json({ error: '请填写施工内容' });

  const result = db.prepare(`
    INSERT INTO construction_logs (project_id, user_id, log_date, weather, workers_count, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ctx.project.id, req.user.id, log_date, weather || null, Math.max(0, Math.floor(Number(workers_count) || 0)), String(content).trim());
  logAudit(req.user.id, 'create_construction_log', 'construction_log', result.lastInsertRowid, { project_id: ctx.project.id }, req.ip);
  res.status(201).json({ message: '施工日志已记录', id: result.lastInsertRowid });
});

// ============ 现场打卡 ============
router.get('/checkins', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可查看施工过程数据' });
  const { page, pageSize } = parsePage(req.query);
  const total = db.prepare('SELECT COUNT(*) c FROM site_checkins WHERE project_id = ?').get(project.id).c;
  const items = db.prepare(`
    SELECT s.*, u.username, u.real_name FROM site_checkins s
    JOIN users u ON s.user_id = u.id
    WHERE s.project_id = ? ORDER BY s.checkin_at DESC LIMIT ? OFFSET ?
  `).all(project.id, pageSize, (page - 1) * pageSize);
  res.json({ items, total, page, pageSize });
});

router.post('/checkins', (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  const { latitude, longitude, address, photo, remark } = req.body;
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: '定位信息无效' });
  }

  // 电子围栏：项目配置了现场坐标时，打卡点必须在半径范围内
  if (ctx.project.site_lat != null && ctx.project.site_lng != null) {
    const R = 6371000;
    const dLat = (lat - ctx.project.site_lat) * Math.PI / 180;
    const dLng = (lng - ctx.project.site_lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(ctx.project.site_lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    const limit = ctx.project.site_radius || 300;
    if (distance > limit) {
      return res.status(400).json({ error: `打卡位置距离项目现场约 ${distance} 米，超出电子围栏（${limit} 米），请在现场打卡` });
    }
  }
  const result = db.prepare(`
    INSERT INTO site_checkins (project_id, user_id, latitude, longitude, address, photo, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ctx.project.id, req.user.id, lat, lng, address ? String(address).slice(0, 200) : null, photo || null, remark || null);
  res.status(201).json({ message: '打卡成功', id: result.lastInsertRowid });
});

// ============ 工程照片 ============
router.get('/photos', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可查看施工过程数据' });
  const category = ['construction', 'hidden', 'acceptance', 'material'].includes(req.query.category) ? req.query.category : null;
  const rows = category
    ? db.prepare(`SELECT p.*, u.username FROM project_photos p JOIN users u ON p.user_id = u.id WHERE p.project_id = ? AND p.category = ? ORDER BY p.id DESC LIMIT 100`).all(project.id, category)
    : db.prepare(`SELECT p.*, u.username FROM project_photos p JOIN users u ON p.user_id = u.id WHERE p.project_id = ? ORDER BY p.id DESC LIMIT 100`).all(project.id);
  res.json({ items: rows });
});

router.post('/photos', upload.array('photos', 9), (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择照片文件' });
  const category = ['construction', 'hidden', 'acceptance', 'material'].includes(req.body.category) ? req.body.category : 'construction';
  const insert = db.prepare('INSERT INTO project_photos (project_id, user_id, category, file_path, caption) VALUES (?, ?, ?, ?, ?)');
  const insertMany = db.transaction((files) => {
    files.forEach(f => insert.run(ctx.project.id, req.user.id, category, '/uploads/construction/' + f.filename, req.body.caption || null));
  });
  insertMany(req.files);
  res.status(201).json({ message: '照片已上传', count: req.files.length });
});

// ============ 隐蔽工程验收 ============
router.get('/hidden', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可查看施工过程数据' });
  const items = db.prepare(`
    SELECT h.*, u.username as creator_name, c.username as checker_name FROM hidden_acceptances h
    JOIN users u ON h.created_by = u.id
    LEFT JOIN users c ON h.checked_by = c.id
    WHERE h.project_id = ? ORDER BY h.id DESC
  `).all(project.id);
  res.json({ items });
});

router.post('/hidden', (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  if (ctx.role !== 'engineer') return res.status(403).json({ error: '隐蔽工程报验由施工方（乙方）提交' });
  const { name, location_desc, content } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: '请填写部位名称' });
  const result = db.prepare(`
    INSERT INTO hidden_acceptances (project_id, name, location_desc, content, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(ctx.project.id, String(name).trim(), location_desc || null, content || null, req.user.id);
  res.status(201).json({ message: '隐蔽工程报验已提交，等待甲方核验', id: result.lastInsertRowid });
});

router.put('/hidden/:id/review', (req, res) => {
  const project = requireOwner(req, res); if (!project) return;
  const rec = db.prepare('SELECT * FROM hidden_acceptances WHERE id = ? AND project_id = ?').get(Number(req.params.id), project.id);
  if (!rec) return res.status(404).json({ error: '记录不存在' });
  const { status, rework_reason } = req.body;
  if (!['approved', 'rework'].includes(status)) return res.status(400).json({ error: '无效的审核结果' });
  if (status === 'rework' && !String(rework_reason || '').trim()) return res.status(400).json({ error: '请填写整改要求' });
  db.prepare('UPDATE hidden_acceptances SET status = ?, rework_reason = ?, checked_by = ?, checked_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, status === 'rework' ? String(rework_reason).trim() : null, req.user.id, rec.id);
  logAudit(req.user.id, 'review_hidden', 'hidden_acceptance', rec.id, { status }, req.ip);
  res.json({ message: status === 'approved' ? '隐蔽工程验收通过' : '已要求整改' });
});

// ============ 材料进场 ============
router.get('/materials', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可查看施工过程数据' });
  const items = db.prepare(`
    SELECT m.*, u.username as recorder_name FROM material_entries m
    JOIN users u ON m.recorded_by = u.id
    WHERE m.project_id = ? ORDER BY m.entry_date DESC, m.id DESC
  `).all(project.id);
  const totalAmount = items.reduce((s, m) => s + (m.amount || 0), 0);
  res.json({ items, total_amount: Math.round(totalAmount * 100) / 100 });
});

router.post('/materials', (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  const { name, spec, qty, unit, amount, supplier, entry_date } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: '请填写材料名称' });
  const qtyNum = Number(qty);
  if (!Number.isFinite(qtyNum) || qtyNum < 0) return res.status(400).json({ error: '数量无效' });
  const amountNum = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amountNum) || amountNum < 0) return res.status(400).json({ error: '金额无效' });
  const result = db.prepare(`
    INSERT INTO material_entries (project_id, name, spec, qty, unit, amount, supplier, entry_date, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ctx.project.id, String(name).trim(), spec || null, qtyNum, unit || null, amountNum, supplier || null,
    entry_date && /^\d{4}-\d{2}-\d{2}/.test(String(entry_date)) ? entry_date : new Date().toISOString().split('T')[0], req.user.id);
  res.status(201).json({ message: '材料进场已登记', id: result.lastInsertRowid });
});

// ============ 工程量清单 BOQ ============
router.get('/boq', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可查看施工过程数据' });
  const items = db.prepare('SELECT * FROM boq_items WHERE project_id = ? ORDER BY id ASC').all(project.id);
  const boqTotal = Math.round(items.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0) * 100) / 100;
  res.json({ items, boq_total: boqTotal, budget: project.budget });
});

router.post('/boq', (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  const { name, spec, unit, qty, unit_price, remark } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: '请填写项目名称' });
  const qtyNum = Number(qty), priceNum = Math.round(Number(unit_price) * 100) / 100;
  if (!Number.isFinite(qtyNum) || qtyNum < 0) return res.status(400).json({ error: '工程量无效' });
  if (!Number.isFinite(priceNum) || priceNum < 0) return res.status(400).json({ error: '单价无效' });
  const result = db.prepare(`
    INSERT INTO boq_items (project_id, name, spec, unit, qty, unit_price, remark, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ctx.project.id, String(name).trim(), spec || null, unit || null, qtyNum, priceNum, remark || null, req.user.id);
  res.status(201).json({ message: '清单项已添加', id: result.lastInsertRowid });
});

router.delete('/boq/:id', (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  db.prepare('DELETE FROM boq_items WHERE id = ? AND project_id = ?').run(Number(req.params.id), ctx.project.id);
  res.json({ message: '已删除' });
});

// ============ 阶段/竣工验收 ============
router.get('/acceptances', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可查看施工过程数据' });
  const items = db.prepare(`
    SELECT a.*, u.username as creator_name, c.username as checker_name FROM acceptances a
    JOIN users u ON a.created_by = u.id
    LEFT JOIN users c ON a.checked_by = c.id
    WHERE a.project_id = ? ORDER BY a.id DESC
  `).all(project.id);
  res.json({ items });
});

router.post('/acceptances', (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  const { type, name, content } = req.body;
  if (!['stage', 'final'].includes(type)) return res.status(400).json({ error: '验收类型无效' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: '请填写验收名称' });
  const result = db.prepare('INSERT INTO acceptances (project_id, type, name, content, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(ctx.project.id, type, String(name).trim(), content || null, req.user.id);
  res.status(201).json({ message: type === 'final' ? '竣工验收申请已提交' : '阶段验收申请已提交', id: result.lastInsertRowid });
});

router.put('/acceptances/:id/review', (req, res) => {
  const project = requireOwner(req, res); if (!project) return;
  const rec = db.prepare('SELECT * FROM acceptances WHERE id = ? AND project_id = ?').get(Number(req.params.id), project.id);
  if (!rec) return res.status(404).json({ error: '验收单不存在' });
  if (rec.status !== 'pending') return res.status(400).json({ error: '该验收单已处理' });
  const { status, rework_reason } = req.body;
  if (!['approved', 'rework'].includes(status)) return res.status(400).json({ error: '无效的审核结果' });
  if (status === 'rework' && !String(rework_reason || '').trim()) return res.status(400).json({ error: '请填写整改要求' });
  db.prepare('UPDATE acceptances SET status = ?, rework_reason = ?, checked_by = ?, checked_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, status === 'rework' ? String(rework_reason).trim() : null, req.user.id, rec.id);
  logAudit(req.user.id, 'review_acceptance', 'acceptance', rec.id, { status, type: rec.type }, req.ip);
  res.json({ message: status === 'approved' ? '验收通过' : '已退回整改' });
});

// ============ 工程文件（图纸/方案等） ============
router.get('/files', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可查看施工过程数据' });
  const items = db.prepare('SELECT * FROM project_files WHERE project_id = ? ORDER BY id DESC LIMIT 200').all(project.id);
  res.json({ items });
});

router.post('/files', upload.array('files', 5), (req, res) => {
  const ctx = requireParticipant(req, res); if (!ctx) return;
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择文件' });
  const insert = db.prepare('INSERT INTO project_files (project_id, uploader_id, name, path, size) VALUES (?, ?, ?, ?, ?)');
  const insertMany = db.transaction((files) => {
    files.forEach(f => insert.run(ctx.project.id, req.user.id, Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 200), '/uploads/construction/' + f.filename, f.size));
  });
  insertMany(req.files);
  res.status(201).json({ message: '文件已上传', count: req.files.length });
});

// ============ 过程数据导出（结算/纠纷留证） ============
function escapeCsv(val) {
  let str = val === null || val === undefined ? '' : String(val);
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str; // 防公式注入
  return `"${str.replace(/"/g, '""')}"`;
}

function sendCsv(res, rows, filename) {
  if (!rows || rows.length === 0) return res.status(404).json({ error: '暂无可导出的数据' });
  const headers = Object.keys(rows[0]);
  const csv = [
    '\ufeff' + headers.join(','),
    ...rows.map(r => headers.map(h => escapeCsv(r[h])).join(','))
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}_${Date.now()}.csv`);
  res.send(csv);
}

router.get('/export', (req, res) => {
  const project = getProject(req, res); if (!project) return;
  if (resolveRole(project, req.user) === 'viewer') return res.status(403).json({ error: '仅项目参与者可导出施工过程数据' });
  const type = String(req.query.type || 'logs');
  const pid = project.id;
  if (type === 'logs') {
    sendCsv(res, db.prepare(`
      SELECT l.log_date as 日期, l.weather as 天气, l.workers_count as 人数, l.content as 施工内容,
             u.real_name as 记录人, u.username as 记录账号, l.created_at as 记录时间
      FROM construction_logs l JOIN users u ON l.user_id = u.id
      WHERE l.project_id = ? ORDER BY l.log_date ASC, l.id ASC`).all(pid), `construction_logs_${pid}`);
  } else if (type === 'checkins') {
    sendCsv(res, db.prepare(`
      SELECT s.checkin_at as 打卡时间, u.real_name as 人员, u.username as 账号,
             s.latitude as 纬度, s.longitude as 经度, s.address as 定位, s.remark as 备注
      FROM site_checkins s JOIN users u ON s.user_id = u.id
      WHERE s.project_id = ? ORDER BY s.checkin_at ASC`).all(pid), `site_checkins_${pid}`);
  } else if (type === 'materials') {
    sendCsv(res, db.prepare(`
      SELECT m.entry_date as 日期, m.name as 材料名称, m.spec as 规格型号, m.qty as 数量, m.unit as 单位,
             m.amount as 金额, m.supplier as 供应商, u.real_name as 登记人, m.created_at as 登记时间
      FROM material_entries m JOIN users u ON m.recorded_by = u.id
      WHERE m.project_id = ? ORDER BY m.entry_date ASC, m.id ASC`).all(pid), `materials_${pid}`);
  } else if (type === 'boq') {
    sendCsv(res, db.prepare(`
      SELECT b.name as 清单项目, b.spec as 规格, b.unit as 单位, b.qty as 工程量, b.unit_price as 单价,
             ROUND(b.qty * b.unit_price, 2) as 合价, b.remark as 备注, b.created_at as 创建时间
      FROM boq_items b WHERE b.project_id = ? ORDER BY b.id ASC`).all(pid), `boq_${pid}`);
  } else {
    return res.status(400).json({ error: '不支持的导出类型（logs/checkins/materials/boq）' });
  }
});

module.exports = router;
