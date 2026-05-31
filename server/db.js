const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DEFAULT_ROOM_ID } = require('./constants');

const DB_PATH = process.env.TEST_DB
  ? ':memory:'
  : path.join(__dirname, '../data/poker.db');

if (DB_PATH !== ':memory:') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');
  if (DB_PATH !== ':memory:') {
    db.run('PRAGMA journal_mode = WAL');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'pending',
      chip_rate REAL NOT NULL DEFAULT 0.05,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host_device_id TEXT NOT NULL,
      chip_rate REAL NOT NULL DEFAULT 0.05,
      status TEXT NOT NULL DEFAULT 'pending',
      max_players INTEGER DEFAULT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      deleted_at INTEGER DEFAULT NULL
    )
  `);

  db.run(
    `
      INSERT OR IGNORE INTO rooms (id, name, host_device_id, chip_rate, status)
      VALUES (?, ?, ?, ?, ?)
    `,
    [DEFAULT_ROOM_ID, '默认比赛', 'legacy-admin', 0.05, 'pending']
  );

  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT DEFAULT 'default' REFERENCES rooms(id),
      name TEXT NOT NULL,
      nickname TEXT NOT NULL UNIQUE,
      initial_chips INTEGER NOT NULL DEFAULT 0,
      final_chips INTEGER DEFAULT NULL,
      net_profit REAL DEFAULT NULL,
      device_id TEXT,
      left_at INTEGER DEFAULT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // 迁移旧表：如果表已存在但没有新列，则添加
  db.all("PRAGMA table_info(players)", (err, cols) => {
    if (err) return;
    const hasDeviceId = cols.some(c => c.name === 'device_id');
    const hasLeftAt = cols.some(c => c.name === 'left_at');
    const hasDeletedAt = cols.some(c => c.name === 'deleted_at');
    const hasAvatar = cols.some(c => c.name === 'avatar');
    const hasRoomId = cols.some(c => c.name === 'room_id');
    if (!hasDeviceId) {
      db.run('ALTER TABLE players ADD COLUMN device_id TEXT');
    }
    if (!hasLeftAt) {
      db.run('ALTER TABLE players ADD COLUMN left_at INTEGER DEFAULT NULL');
    }
    if (!hasDeletedAt) {
      db.run('ALTER TABLE players ADD COLUMN deleted_at INTEGER DEFAULT NULL');
    }
    if (!hasAvatar) {
      db.run('ALTER TABLE players ADD COLUMN avatar TEXT DEFAULT NULL');
    }
    if (!hasRoomId) {
      db.run("ALTER TABLE players ADD COLUMN room_id TEXT DEFAULT 'default'");
    }
    db.run('UPDATE players SET room_id = ? WHERE room_id IS NULL', [DEFAULT_ROOM_ID]);
    db.run('CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_players_room_device ON players(room_id, device_id)');
    // 添加 nickname 唯一索引（如果无重复数据）
    db.all("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_players_nickname'", (err, rows) => {
      if (err || rows.length > 0) return;
      db.all('SELECT nickname, COUNT(*) as cnt FROM players GROUP BY nickname HAVING cnt > 1', (err, dups) => {
        if (err || (dups && dups.length > 0)) {
          console.warn('[DB MIGRATION] 发现重复昵称，跳过 UNIQUE 索引添加:', dups ? dups.map(d => d.nickname) : 'unknown');
          return;
        }
        db.run('CREATE UNIQUE INDEX idx_players_nickname ON players(nickname)', (err) => {
          if (err) console.error('[DB MIGRATION] 创建唯一索引失败:', err);
          else console.log('[DB MIGRATION] 已添加 nickname 唯一索引');
        });
      });
    });
  });

  db.get('SELECT id FROM settings WHERE id = 1', (err, row) => {
    if (!row) {
      db.run('INSERT INTO settings (id, status, chip_rate) VALUES (1, ?, ?)', ['pending', 0.05], () => {
        ensureDefaultRoom('pending', 0.05);
      });
      return;
    }
    db.get('SELECT status, chip_rate FROM settings WHERE id = 1', (settingsErr, settings) => {
      if (settingsErr || !settings) return;
      ensureDefaultRoom(settings.status, settings.chip_rate);
    });
  });
});

function ensureDefaultRoom(status, chipRate) {
  db.run(
    `
      INSERT INTO rooms (id, name, host_device_id, chip_rate, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        chip_rate = excluded.chip_rate,
        status = excluded.status,
        updated_at = strftime('%s', 'now') * 1000
    `,
    [DEFAULT_ROOM_ID, '默认比赛', 'legacy-admin', chipRate, status]
  );
}

module.exports = db;
