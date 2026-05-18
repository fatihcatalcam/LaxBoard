const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs   = require('fs');

const DB_PATH   = path.join(__dirname, '..', 'laxboard.db');
const LOCK_PATH = DB_PATH + '.lock';

function _clearStaleLock() {
  try {
    fs.rmSync(LOCK_PATH, { recursive: true, force: true });
  } catch (_) { /* nothing to clean */ }
}

let _db;

function getDb() {
  if (!_db) {
    _clearStaleLock();
    _db = new Database(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');
    _initSchema(_db);
    process.on('exit', () => { try { _db.close(); } catch (_) {} });
  }
  return _db;
}

function createTestDb() {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  _initSchema(db);
  return db;
}

function _initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  const setsRow = db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='sets'");
  if (!setsRow) {
    db.exec(`
      CREATE TABLE sets (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, name)
      );
    `);
  } else if (!String(setsRow.sql).includes('user_id')) {
    try {
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec('BEGIN');
      db.exec('ALTER TABLE sets RENAME TO sets_old');
      db.exec(`CREATE TABLE sets (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, name)
      )`);
      db.exec('INSERT INTO sets SELECT id, name, NULL, created_at, updated_at FROM sets_old');
      db.exec('DROP TABLE sets_old');
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS player_paths (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id        INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      player_number INTEGER NOT NULL CHECK(player_number BETWEEN 0 AND 6),
      path          TEXT NOT NULL,
      step_index    INTEGER NOT NULL DEFAULT 0
    );
  `);

  try {
    db.exec('ALTER TABLE player_paths ADD COLUMN step_index INTEGER NOT NULL DEFAULT 0');
  } catch (_) { /* column already exists — safe to ignore */ }

  // Migrate: old schema had BETWEEN 1 AND 6, ball (player_number=0) requires BETWEEN 0 AND 6
  const tableRow = db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='player_paths'");
  if (tableRow && String(tableRow.sql).includes('BETWEEN 1 AND 6')) {
    try {
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec('BEGIN');
      db.exec('ALTER TABLE player_paths RENAME TO player_paths_old');
      db.exec(`CREATE TABLE player_paths (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        set_id        INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
        player_number INTEGER NOT NULL CHECK(player_number BETWEEN 0 AND 6),
        path          TEXT NOT NULL,
        step_index    INTEGER NOT NULL DEFAULT 0
      )`);
      db.exec('INSERT INTO player_paths SELECT * FROM player_paths_old');
      db.exec('DROP TABLE player_paths_old');
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

module.exports = { getDb, createTestDb };
