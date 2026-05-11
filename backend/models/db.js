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
    CREATE TABLE IF NOT EXISTS sets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
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
}

module.exports = { getDb, createTestDb };
