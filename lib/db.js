import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  telegram_id  INTEGER PRIMARY KEY,
  username     TEXT,
  first_name   TEXT,
  label        TEXT,                        -- e.g. test user label
  status       TEXT NOT NULL DEFAULT 'new', -- new | registered | deposited
  trader_id    TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clicks (
  click_id    TEXT PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS signal_uses (
  telegram_id INTEGER NOT NULL,
  day         TEXT NOT NULL,
  n           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (telegram_id, day)
);
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  telegram_id INTEGER,
  type        TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'app', -- app | real | sim | unknown
  details     TEXT
);
CREATE TABLE IF NOT EXISTS postbacks_raw (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  ts    INTEGER NOT NULL,
  ip    TEXT,
  query TEXT NOT NULL,
  note  TEXT
);
CREATE TABLE IF NOT EXISTS postback_dedup (
  dedup_key TEXT PRIMARY KEY,
  ts        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
