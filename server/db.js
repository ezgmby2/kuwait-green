import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS plants (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id      TEXT NOT NULL,
  species      TEXT NOT NULL,
  nickname     TEXT,
  note         TEXT,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  photo        TEXT NOT NULL,
  hidden       INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plants_zone ON plants(zone_id, hidden);
CREATE INDEX IF NOT EXISTS idx_plants_user ON plants(user_id);
CREATE INDEX IF NOT EXISTS idx_plants_created ON plants(created_at DESC);

-- Growth photos added to a planting journey over time.
CREATE TABLE IF NOT EXISTS plant_updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id   INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  photo      TEXT NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_updates_plant ON plant_updates(plant_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  plant_id   INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (plant_id, user_id)
);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  // Columns added after the first release: add them to older databases.
  const cols = new Set(db.prepare('PRAGMA table_info(plants)').all().map((c) => c.name));
  for (const [name, def] of [['space', 'TEXT'], ['place', 'TEXT'], ['sun', 'TEXT'], ['last_watered_at', 'INTEGER']]) {
    if (!cols.has(name)) db.exec(`ALTER TABLE plants ADD COLUMN ${name} ${def}`);
  }
  return db;
}

/** Runs fn inside a transaction (node:sqlite has no helper for this). */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
