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
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      deleted_at INTEGER DEFAULT NULL,
      avatar TEXT DEFAULT NULL
    )
  `);

  db.all('PRAGMA table_info(players)', (err, cols) => {
    if (err) return;
    addColumnIfMissing(cols, 'device_id', 'ALTER TABLE players ADD COLUMN device_id TEXT');
    addColumnIfMissing(cols, 'left_at', 'ALTER TABLE players ADD COLUMN left_at INTEGER DEFAULT NULL');
    addColumnIfMissing(cols, 'deleted_at', 'ALTER TABLE players ADD COLUMN deleted_at INTEGER DEFAULT NULL');
    addColumnIfMissing(cols, 'avatar', 'ALTER TABLE players ADD COLUMN avatar TEXT DEFAULT NULL');
    addColumnIfMissing(cols, 'room_id', "ALTER TABLE players ADD COLUMN room_id TEXT DEFAULT 'default'");
    db.run('UPDATE players SET room_id = ? WHERE room_id IS NULL', [DEFAULT_ROOM_ID]);
    migrateNicknameUniqueness();
  });

  db.all('PRAGMA table_info(rooms)', (err, cols) => {
    if (err) return;
    addColumnIfMissing(cols, 'game_mode', "ALTER TABLE rooms ADD COLUMN game_mode TEXT DEFAULT 'tournament'");
    addColumnIfMissing(cols, 'sb_amount', 'ALTER TABLE rooms ADD COLUMN sb_amount INTEGER DEFAULT 1');
    addColumnIfMissing(cols, 'bb_amount', 'ALTER TABLE rooms ADD COLUMN bb_amount INTEGER DEFAULT 2');
    addColumnIfMissing(cols, 'action_timeout_seconds', 'ALTER TABLE rooms ADD COLUMN action_timeout_seconds INTEGER DEFAULT 30');
    addColumnIfMissing(cols, 'current_hand_id', 'ALTER TABLE rooms ADD COLUMN current_hand_id INTEGER DEFAULT NULL');
  });

  // Poker hand tables
  db.run(`
    CREATE TABLE IF NOT EXISTS hands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      status TEXT NOT NULL DEFAULT 'pending',
      dealer_seat INTEGER NOT NULL DEFAULT 0,
      small_blind_seat INTEGER,
      big_blind_seat INTEGER,
      small_blind_amount INTEGER NOT NULL DEFAULT 1,
      big_blind_amount INTEGER NOT NULL DEFAULT 2,
      community_cards TEXT DEFAULT '[]',
      deck_snapshot TEXT DEFAULT '[]',
      current_round TEXT,
      current_seat INTEGER,
      current_bet INTEGER NOT NULL DEFAULT 0,
      current_min_raise INTEGER,
      total_pot INTEGER NOT NULL DEFAULT 0,
      action_timeout_seconds INTEGER NOT NULL DEFAULT 30,
      action_started_at INTEGER,
      started_at INTEGER,
      ended_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hand_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id INTEGER NOT NULL REFERENCES hands(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      seat INTEGER NOT NULL,
      hole_cards TEXT DEFAULT '[]',
      current_chips INTEGER NOT NULL,
      current_bet INTEGER NOT NULL DEFAULT 0,
      total_bet INTEGER NOT NULL DEFAULT 0,
      is_folded INTEGER NOT NULL DEFAULT 0,
      is_all_in INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      result INTEGER DEFAULT 0,
      hand_rank TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hand_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id INTEGER NOT NULL REFERENCES hands(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      action_type TEXT NOT NULL,
      amount INTEGER DEFAULT 0,
      round TEXT NOT NULL,
      seat INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id INTEGER NOT NULL REFERENCES hands(id),
      amount INTEGER NOT NULL DEFAULT 0,
      eligible_players TEXT DEFAULT '[]',
      is_side_pot INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_hands_room_id ON hands(room_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_hand_players_hand_id ON hand_players(hand_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_hand_actions_hand_id ON hand_actions(hand_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pots_hand_id ON pots(hand_id)');

  db.all('PRAGMA table_info(hands)', (err, cols) => {
    if (err) return;
    if (cols && cols.length > 0) {
      addColumnIfMissing(cols, 'current_bet', 'ALTER TABLE hands ADD COLUMN current_bet INTEGER DEFAULT 0');
      addColumnIfMissing(cols, 'deck_snapshot', 'ALTER TABLE hands ADD COLUMN deck_snapshot TEXT DEFAULT \'[]\'');
      addColumnIfMissing(cols, 'action_timeout_seconds', 'ALTER TABLE hands ADD COLUMN action_timeout_seconds INTEGER DEFAULT 30');
      addColumnIfMissing(cols, 'action_started_at', 'ALTER TABLE hands ADD COLUMN action_started_at INTEGER');
    }
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

function addColumnIfMissing(cols, name, sql) {
  if (!cols.some(col => col.name === name)) {
    db.run(sql);
  }
}

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

function migrateNicknameUniqueness() {
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='players'", (err, row) => {
    if (err || !row?.sql) return;
    const hasGlobalNicknameUnique = /nickname\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql);
    if (!hasGlobalNicknameUnique) {
      return ensureRoomIndexes();
    }

    db.serialize(() => {
      db.run('ALTER TABLE players RENAME TO players_legacy_unique');
      db.run(`
        CREATE TABLE players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id TEXT DEFAULT 'default' REFERENCES rooms(id),
          name TEXT NOT NULL,
          nickname TEXT NOT NULL,
          initial_chips INTEGER NOT NULL DEFAULT 0,
          final_chips INTEGER DEFAULT NULL,
          net_profit REAL DEFAULT NULL,
          device_id TEXT,
          left_at INTEGER DEFAULT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          deleted_at INTEGER DEFAULT NULL,
          avatar TEXT DEFAULT NULL
        )
      `);
      db.run(
        `
          INSERT INTO players (
            id,
            room_id,
            name,
            nickname,
            initial_chips,
            final_chips,
            net_profit,
            device_id,
            left_at,
            created_at,
            deleted_at,
            avatar
          )
          SELECT
            id,
            COALESCE(room_id, ?),
            name,
            nickname,
            initial_chips,
            final_chips,
            net_profit,
            device_id,
            left_at,
            created_at,
            deleted_at,
            avatar
          FROM players_legacy_unique
        `,
        [DEFAULT_ROOM_ID]
      );
      db.run('DROP TABLE players_legacy_unique');
      ensureRoomIndexes();
    });
  });
}

function ensureRoomIndexes() {
  db.run('DROP INDEX IF EXISTS idx_players_nickname');
  db.run('CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_players_room_device ON players(room_id, device_id)');
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_room_nickname
    ON players(room_id, nickname)
    WHERE deleted_at IS NULL
  `);
}

module.exports = db;
