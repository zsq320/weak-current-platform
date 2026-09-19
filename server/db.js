// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.
const Database = require('better-sqlite3');
const path = require('path');

// 支持从环境变量读取数据库路径，默认为项目根目录
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');

// 确保数据库目录存在
const dbDir = path.dirname(dbPath);
const fs = require('fs');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'engineer', 'admin')),
    real_name TEXT,
    phone TEXT,
    email TEXT,
    certification TEXT,
    certification_status TEXT DEFAULT 'none' CHECK(certification_status IN ('none', 'pending', 'approved', 'rejected')),
    balance REAL DEFAULT 0,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    location TEXT,
    budget REAL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'bidding', 'in_progress', 'completed', 'cancelled')),
    deadline TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    engineer_id INTEGER NOT NULL,
    price REAL NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (engineer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    bid_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    engineer_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'terminated')),
    signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (bid_id) REFERENCES bids(id),
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (engineer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_id) REFERENCES contracts(id),
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER,
    to_user_id INTEGER NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'system' CHECK(type IN ('system', 'project', 'bid', 'contract')),
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  );
`);

// 迁移：添加 is_disabled 字段
try {
  db.prepare("SELECT is_disabled FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0");
}

// 迁移：添加 phone_verified 和 email_verified 字段
try {
  db.prepare("SELECT phone_verified FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0");
}
try {
  db.prepare("SELECT email_verified FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0");
}

// 验证码表
db.exec(`
  CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('phone', 'email')),
    code TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'register' CHECK(purpose IN ('register', 'login')),
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_verification_target ON verification_codes(target, type, purpose);
`);

// JWT黑名单表 - 用于登出后使令牌立即失效
db.exec(`
  CREATE TABLE IF NOT EXISTS token_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jti TEXT UNIQUE NOT NULL,
    token_type TEXT NOT NULL CHECK(token_type IN ('access', 'refresh')),
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(jti);
  CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at);
`);

// 定期清理过期的黑名单令牌（每天执行）
const cleanupBlacklist = db.prepare(`
  DELETE FROM token_blacklist WHERE expires_at < datetime('now')
`);
// 定期清理过期验证码（每天执行）
const cleanupVerificationCodes = db.prepare(`
  DELETE FROM verification_codes WHERE expires_at < datetime('now', '-1 day')
`);
setInterval(() => {
  cleanupBlacklist.run();
  cleanupVerificationCodes.run();
}, 24 * 60 * 60 * 1000); // 24小时

// 迁移：添加敏感字段（加密存储）
try {
  db.prepare("SELECT id_card_encrypted FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN id_card_encrypted TEXT");
}
try {
  db.prepare("SELECT bank_card_encrypted FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN bank_card_encrypted TEXT");
}

// 迁移：添加实名认证字段
try {
  db.prepare("SELECT real_name_verified FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN real_name_verified INTEGER DEFAULT 0");
}
try {
  db.prepare("SELECT id_card_verified FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN id_card_verified INTEGER DEFAULT 0");
}
try {
  db.prepare("SELECT verified_at FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN verified_at DATETIME");
}
try {
  db.prepare("SELECT verified_by FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN verified_by INTEGER");
}

// 项目任务表
db.exec(`
  CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    assignee_id INTEGER,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project ON project_tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON project_tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON project_tasks(status);
`);

// 项目里程碑表
db.exec(`
  CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'delayed')),
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);
  CREATE INDEX IF NOT EXISTS idx_milestones_status ON project_milestones(status);
`);

// 迁移：为 bids 表添加评分和资质字段
const bidColumns = [
  { name: 'duration', type: 'TEXT', default: null },
  { name: 'duration_unit', type: 'TEXT', default: "'days'" },
  { name: 'qualifications', type: 'TEXT', default: null },
  { name: 'experience_years', type: 'INTEGER', default: '0' },
  { name: 'technical_score', type: 'INTEGER', default: '0' },
  { name: 'price_score', type: 'INTEGER', default: '0' },
  { name: 'duration_score', type: 'INTEGER', default: '0' },
  { name: 'qualification_score', type: 'INTEGER', default: '0' },
  { name: 'total_score', type: 'REAL', default: '0' },
  { name: 'scored_at', type: 'DATETIME', default: null },
  { name: 'scored_by', type: 'INTEGER', default: null }
];

bidColumns.forEach(col => {
  try {
    db.prepare(`SELECT ${col.name} FROM bids LIMIT 1`).get();
  } catch (e) {
    const defaultClause = col.default ? `DEFAULT ${col.default}` : '';
    db.exec(`ALTER TABLE bids ADD COLUMN ${col.name} ${col.type} ${defaultClause}`);
  }
});

// 投标评分明细表
db.exec(`
  CREATE TABLE IF NOT EXISTS bid_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bid_id INTEGER NOT NULL UNIQUE,
    project_id INTEGER NOT NULL,

    -- 评分维度（每项 0-25 分，总分 100）
    price_score INTEGER DEFAULT 0 CHECK(price_score >= 0 AND price_score <= 25),
    duration_score INTEGER DEFAULT 0 CHECK(duration_score >= 0 AND duration_score <= 25),
    qualification_score INTEGER DEFAULT 0 CHECK(qualification_score >= 0 AND qualification_score <= 25),
    technical_score INTEGER DEFAULT 0 CHECK(technical_score >= 0 AND technical_score <= 25),

    -- 评分明细
    price_comment TEXT,
    duration_comment TEXT,
    qualification_comment TEXT,
    technical_comment TEXT,

    -- 评分人信息
    scored_by INTEGER NOT NULL,
    total_score REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (scored_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_bid_scores_bid ON bid_scores(bid_id);
  CREATE INDEX IF NOT EXISTS idx_bid_scores_project ON bid_scores(project_id);
`);

// 创建投标评分视图（方便查询）
db.exec(`
  CREATE VIEW IF NOT EXISTS v_bid_scores AS
  SELECT
    b.id as bid_id,
    b.project_id,
    b.engineer_id,
    b.price,
    b.duration,
    b.status,
    u.username,
    u.real_name,
    u.phone,
    bs.price_score,
    bs.duration_score,
    bs.qualification_score,
    bs.technical_score,
    bs.total_score,
    bs.scored_by,
    bs.created_at as scored_at
  FROM bids b
  LEFT JOIN bid_scores bs ON b.id = bs.bid_id
  LEFT JOIN users u ON b.engineer_id = u.id
  WHERE bs.id IS NOT NULL
  ORDER BY bs.total_score DESC;
`);

// ============ 商用化第一阶段：资金/合同/施工/运营 ============

// 平台设置（佣金率、质保金率等）
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('commission_rate', '5'),
    ('retention_rate', '5'),
    ('warranty_months', '12'),
    ('require_final_acceptance', '0'),
    ('require_both_signatures', '0');
`);

// 合同扩展字段：正文、签署、托管、佣金/质保金
const contractColumns = [
  { name: 'content', type: 'TEXT' },
  { name: 'content_version', type: 'INTEGER', default: '1' },
  { name: 'content_hash', type: 'TEXT' },
  { name: 'sign_status', type: 'TEXT', default: "'pending'" },
  { name: 'escrow_status', type: 'TEXT', default: "'none'" },
  { name: 'commission_rate', type: 'REAL' },
  { name: 'retention_rate', type: 'REAL' },
  { name: 'retention_amount', type: 'REAL', default: '0' },
  { name: 'warranty_months', type: 'INTEGER' },
  { name: 'retention_released_at', type: 'DATETIME' },
  { name: 'owner_signed_at', type: 'DATETIME' },
  { name: 'engineer_signed_at', type: 'DATETIME' }
];
contractColumns.forEach(col => {
  try {
    db.prepare(`SELECT ${col.name} FROM contracts LIMIT 1`).get();
  } catch (e) {
    const defaultClause = col.default ? `DEFAULT ${col.default}` : '';
    db.exec(`ALTER TABLE contracts ADD COLUMN ${col.name} ${col.type} ${defaultClause}`);
  }
});

// 资金流水账本（所有余额变动必须留痕）
db.exec(`
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('deposit','withdraw','withdraw_refund','pay_escrow','release_escrow','settlement','commission','retention','retention_release','refund','penalty')),
    amount REAL NOT NULL,
    balance_after REAL,
    ref_type TEXT,
    ref_id INTEGER,
    remark TEXT,
    operator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type, created_at);
`);

// 充值订单（支付网关可插拔，未配置时走 mock 测试通道）
db.exec(`
  CREATE TABLE IF NOT EXISTS deposit_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    channel TEXT DEFAULT 'mock',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','expired','failed')),
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_deposit_user ON deposit_orders(user_id, status);
`);

// 提现申请（管理员审核后打款）
db.exec(`
  CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    bank_info TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid')),
    reject_reason TEXT,
    processed_by INTEGER,
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// 合同签署记录（哈希留痕）
db.exec(`
  CREATE TABLE IF NOT EXISTS contract_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','engineer')),
    content_version INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    ip TEXT,
    signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_id) REFERENCES contracts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(contract_id, user_id, content_version)
  );
`);

// 施工日志
db.exec(`
  CREATE TABLE IF NOT EXISTS construction_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    log_date TEXT NOT NULL,
    weather TEXT,
    workers_count INTEGER DEFAULT 0,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_clogs_project ON construction_logs(project_id, log_date);
`);

// 现场打卡（GPS 定位留痕）
db.exec(`
  CREATE TABLE IF NOT EXISTS site_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    latitude REAL,
    longitude REAL,
    address TEXT,
    photo TEXT,
    remark TEXT,
    checkin_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_checkins_project ON site_checkins(project_id, user_id, checkin_at);
`);

// 工程照片（施工/隐蔽/验收/材料）
db.exec(`
  CREATE TABLE IF NOT EXISTS project_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    category TEXT DEFAULT 'construction' CHECK(category IN ('construction','hidden','acceptance','material')),
    file_path TEXT NOT NULL,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// 隐蔽工程验收记录
db.exec(`
  CREATE TABLE IF NOT EXISTS hidden_acceptances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    location_desc TEXT,
    content TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rework')),
    rework_reason TEXT,
    checked_by INTEGER,
    checked_at DATETIME,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// 材料进场记录
db.exec(`
  CREATE TABLE IF NOT EXISTS material_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    spec TEXT,
    qty REAL NOT NULL DEFAULT 0,
    unit TEXT,
    amount REAL DEFAULT 0,
    supplier TEXT,
    entry_date TEXT,
    recorded_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// 工程量清单 BOQ
db.exec(`
  CREATE TABLE IF NOT EXISTS boq_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    spec TEXT,
    unit TEXT,
    qty REAL DEFAULT 0,
    unit_price REAL DEFAULT 0,
    remark TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_boq_project ON boq_items(project_id);
`);

// 分阶段/竣工验收单
db.exec(`
  CREATE TABLE IF NOT EXISTS acceptances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    type TEXT DEFAULT 'stage' CHECK(type IN ('stage','final')),
    name TEXT NOT NULL,
    content TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rework')),
    rework_reason TEXT,
    checked_by INTEGER,
    checked_at DATETIME,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_acceptances_project ON acceptances(project_id, type);
`);

// 质保工单
db.exec(`
  CREATE TABLE IF NOT EXISTS warranty_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    contract_id INTEGER,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open','processing','resolved','closed')),
    handle_note TEXT,
    handled_by INTEGER,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// 发票申请
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contract_id INTEGER,
    title_type TEXT DEFAULT 'company' CHECK(title_type IN ('personal','company')),
    title TEXT NOT NULL,
    tax_no TEXT,
    amount REAL NOT NULL CHECK(amount > 0),
    invoice_type TEXT DEFAULT 'normal' CHECK(invoice_type IN ('normal','special')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','issued')),
    remark TEXT,
    processed_by INTEGER,
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// 纠纷/投诉工单
db.exec(`
  CREATE TABLE IF NOT EXISTS disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_id INTEGER,
    contract_id INTEGER,
    against_user_id INTEGER,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open','arbitrating','resolved','closed')),
    resolution TEXT,
    refund_amount REAL DEFAULT 0,
    handled_by INTEGER,
    handled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status, created_at);
`);

// 评价申诉
db.exec(`
  CREATE TABLE IF NOT EXISTS review_appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    handled_by INTEGER,
    handled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (review_id) REFERENCES reviews(id)
  );
`);

// 企业认证（施工单位/资质）
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    license_no TEXT,
    qualification_level TEXT,
    qualification_no TEXT,
    license_image TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    reject_reason TEXT,
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// 项目内双方沟通聊天（留痕）
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    msg_type TEXT DEFAULT 'text' CHECK(msg_type IN ('text','image')),
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(project_id, created_at);
`);

// 协议接受记录（用户协议/隐私政策）
db.exec(`
  CREATE TABLE IF NOT EXISTS agreement_accepts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('user_agreement','privacy')),
    version TEXT NOT NULL DEFAULT '1.0',
    ip TEXT,
    accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 工程文件（图纸/方案等）
db.exec(`
  CREATE TABLE IF NOT EXISTS project_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    uploader_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pfiles_project ON project_files(project_id);
`);

// 迁移：实名认证增加身份证校验位标记
try {
  db.prepare("SELECT id_checksum_valid FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN id_checksum_valid INTEGER DEFAULT 0");
}

// 迁移：为升级前已结算的历史合同补录资金流水（升级前为全额划转，无佣金/质保金）
try {
  const backfilled = db.prepare("SELECT value FROM settings WHERE key = 'ledger_backfilled'").get();
  if (!backfilled) {
    const completed = db.prepare("SELECT * FROM contracts WHERE status = 'completed'").all();
    const insertLedger = db.prepare(`
      INSERT INTO ledger (user_id, type, amount, balance_after, ref_type, ref_id, remark, created_at)
      VALUES (?, 'settlement', ?, NULL, 'contract', ?, ?, ?)
    `);
    const backfillTx = db.transaction(() => {
      let count = 0;
      completed.forEach(c => {
        const exists = db.prepare("SELECT id FROM ledger WHERE ref_type = 'contract' AND ref_id = ? AND type = 'settlement'").get(c.id);
        if (exists) return;
        const owner = db.prepare('SELECT id FROM users WHERE id = ?').get(c.owner_id);
        const engineer = db.prepare('SELECT id FROM users WHERE id = ?').get(c.engineer_id);
        if (!owner || !engineer) return;
        insertLedger.run(c.owner_id, -c.amount, c.id, `历史结算补录（合同#${c.id}）`, c.completed_at);
        insertLedger.run(c.engineer_id, c.amount, c.id, `历史结算补录（合同#${c.id}）`, c.completed_at);
        count++;
      });
      return count;
    });
    const n = backfillTx();
    db.prepare("INSERT INTO settings (key, value) VALUES ('ledger_backfilled', '1')").run();
    if (n > 0) console.log(`[迁移] 已为 ${n} 份历史合同补录资金流水`);
  }
} catch (e) {
  console.error('[迁移] 历史流水补录失败:', e.message);
}

module.exports = db;
