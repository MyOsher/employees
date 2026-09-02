'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR =
  process.env.DB_DIR || (process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data'));

// Each business gets its own SQLite file — genuinely separate databases.
function resolveDbPath(fileName) {
  if (process.env.DB_PATH === ':memory:') return ':memory:';
  return path.join(DATA_DIR, fileName);
}

function createDb(fileName) {
  const dbPath = resolveDbPath(fileName);
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE,
      active      INTEGER NOT NULL DEFAULT 1,
      pin_hash    TEXT,
      pin_salt    TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      work_date     TEXT NOT NULL,             -- YYYY-MM-DD
      clock_in      TEXT NOT NULL,             -- ISO 8601 UTC
      clock_out     TEXT,                      -- ISO 8601 UTC, NULL while clocked in
      break_minutes INTEGER NOT NULL DEFAULT 0,
      notes         TEXT DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_entries_employee_date
      ON time_entries (employee_id, work_date);

    CREATE TABLE IF NOT EXISTS app_settings (
      id                     INTEGER PRIMARY KEY CHECK (id = 1),
      manager_pin_hash       TEXT NOT NULL,
      manager_pin_salt       TEXT NOT NULL,
      daily_standard_minutes INTEGER NOT NULL DEFAULT 510
    );
  `);
  // Seed the default manager PIN (0000) on first run; changed from the app.
  if (!db.prepare('SELECT id FROM app_settings WHERE id = 1').get()) {
    const { makePinHash } = require('./auth');
    const { hash, salt } = makePinHash('0000');
    db.prepare(
      'INSERT INTO app_settings (id, manager_pin_hash, manager_pin_salt) VALUES (1, ?, ?)'
    ).run(hash, salt);
  }
  return db;
}

module.exports = { createDb };
