// SQLite persistence layer. Uses Node's built-in `node:sqlite` (Node >= 22.5),
// so there is nothing to compile or install.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.FITFUEL_DB || path.join(__dirname, 'fitfuel.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_sub    TEXT UNIQUE,
  name          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sex            TEXT,
  age            INTEGER,
  height_cm      REAL,
  weight_kg      REAL,
  activity_level TEXT,
  goal           TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dietary (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restriction_id TEXT NOT NULL,
  PRIMARY KEY (user_id, restriction_id)
);

CREATE TABLE IF NOT EXISTS workouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source       TEXT NOT NULL DEFAULT 'manual',
  type         TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  duration_min INTEGER,
  distance_km  REAL,
  intensity    TEXT,
  calories     INTEGER,
  planned      INTEGER NOT NULL DEFAULT 0,
  external_id  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_user_time ON workouts(user_id, start_time);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_ext ON workouts(user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS meal_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,
  restaurant TEXT,
  calories   INTEGER,
  protein_g  REAL,
  carb_g     REAL,
  fat_g      REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meal_log_user_date ON meal_log(user_id, date);

CREATE TABLE IF NOT EXISTS connections (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at   INTEGER,
  scope        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE IF NOT EXISTS blood_work (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  original_name TEXT,
  size          INTEGER,
  parsed        INTEGER NOT NULL DEFAULT 0,
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// node:sqlite has no migration system, and CREATE TABLE IF NOT EXISTS won't add
// columns to an existing file — so new columns are added idempotently here.
function alterIfMissing(sql) {
  try {
    db.exec(sql);
  } catch (e) {
    // Column already exists — fine.
  }
}

alterIfMissing(`ALTER TABLE profiles ADD COLUMN food_preferences TEXT`);
alterIfMissing(`ALTER TABLE dietary ADD COLUMN severity TEXT NOT NULL DEFAULT 'severe'`);
alterIfMissing(`ALTER TABLE dietary ADD COLUMN label TEXT`);
alterIfMissing(`ALTER TABLE blood_work ADD COLUMN report_type TEXT NOT NULL DEFAULT 'blood'`);
alterIfMissing(`ALTER TABLE blood_work ADD COLUMN raw_text TEXT`);
alterIfMissing(`ALTER TABLE blood_work ADD COLUMN summary TEXT`);
alterIfMissing(`ALTER TABLE blood_work ADD COLUMN markers_json TEXT`);
alterIfMissing(`ALTER TABLE blood_work ADD COLUMN nutrition_notes TEXT`);
alterIfMissing(`ALTER TABLE blood_work ADD COLUMN analyzed_at TEXT`);

console.log(`[db] SQLite ready at ${DB_PATH}`);

module.exports = db;
