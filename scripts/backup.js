// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.

/**
 * 数据库备份 CLI
 * 用法：node scripts/backup.js
 * 建议在服务器上配置计划任务每日执行（Linux crontab / Windows 任务计划程序）。
 */

const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');
const backupDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

// 打开只读副本执行在线备份（WAL 模式下安全）
const Database = require('better-sqlite3');
const source = new Database(dbPath, { readonly: true });
const name = `backup-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.db`;

source.backup(path.join(backupDir, name))
  .then(() => {
    console.log(`备份完成: backups/${name}`);
    source.close();
    // 保留最近 30 份
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort();
    while (files.length > 30) {
      const oldest = files.shift();
      fs.unlinkSync(path.join(backupDir, oldest));
      console.log(`清理旧备份: ${oldest}`);
    }
  })
  .catch(err => {
    console.error('备份失败:', err.message);
    process.exit(1);
  });
