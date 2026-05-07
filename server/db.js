const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.TEST_DB
  ? ':memory:'
  : path.join(__dirname, '../data/poker.db');

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'pending',
      chip_rate REAL NOT NULL DEFAULT 10,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nickname TEXT NOT NULL,
      initial_chips INTEGER NOT NULL DEFAULT 0,
      final_chips INTEGER DEFAULT NULL,
      net_profit REAL DEFAULT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.get('SELECT id FROM settings WHERE id = 1', (err, row) => {
    if (!row) {
      db.run('INSERT INTO settings (id, status, chip_rate) VALUES (1, ?, ?)', ['pending', 10]);
    }
  });
});

module.exports = db;
