// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.
const db = require('../db');

// 确保 audit_logs 表存在
// v2：去掉 user_id 外键约束（系统级事件 user_id=0 需要落库），历史表自动迁移
try {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='audit_logs'").get();
  const hasFk = tableInfo && /REFERENCES\s+users/i.test(tableInfo.sql);
  if (!tableInfo) {
    db.exec(`
      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 0,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
    `);
  } else if (hasFk) {
    // 重建表：去除 FK（SQLite 不支持 DROP CONSTRAINT）
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE audit_logs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 0,
          action TEXT NOT NULL,
          target_type TEXT,
          target_id INTEGER,
          details TEXT,
          ip_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO audit_logs_new SELECT id, user_id, action, target_type, target_id, details, ip_address, created_at FROM audit_logs;
        DROP TABLE audit_logs;
        ALTER TABLE audit_logs_new RENAME TO audit_logs;
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
      `);
    });
    migrate();
    console.log('[迁移] audit_logs 表已重建（去除 FK 约束）');
  }
} catch (e) {
  console.error('[迁移] audit_logs 表初始化失败:', e.message);
}

const stmt = db.prepare(
  'INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
);

function logAudit(userId, action, targetType, targetId, details, ip) {
  try {
    // details 兼容对象/数组：序列化为 JSON 字符串（TEXT 字段）
    let detailsText = null;
    if (details !== undefined && details !== null) {
      detailsText = typeof details === 'string' ? details : JSON.stringify(details);
    }
    stmt.run(
      Number(userId) > 0 ? Number(userId) : 0,
      String(action || 'unknown'),
      targetType || null,
      targetId === undefined || targetId === null ? null : (Number(targetId) || null),
      detailsText,
      ip || null
    );
  } catch (e) {
    // 审计失败必须留痕到结构化日志，且绝不影响业务
    try {
      require('../utils/logger').error({ kind: 'audit_failure', action, error: e.message });
    } catch (_) {
      console.error('Audit log error:', e.message);
    }
  }
}

module.exports = { logAudit };
