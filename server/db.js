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
setInterval(() => {
  cleanupBlacklist.run();
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

module.exports = db;
