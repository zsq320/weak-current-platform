const db = require('../db');

// 确保 audit_logs 表存在
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);
} catch (e) {
  // 表已存在则忽略
}

const stmt = db.prepare(
  'INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
);

function logAudit(userId, action, targetType, targetId, details, ip) {
  try {
    stmt.run(userId, action, targetType || null, targetId || null, details || null, ip || null);
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

module.exports = { logAudit };
