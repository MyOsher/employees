'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

// On Vercel the deployment filesystem is read-only; only /tmp is writable
// (and ephemeral — use an external database for durable production data).
const DB_PATH =
  process.env.DB_PATH ||
  (process.env.VERCEL
    ? '/tmp/workhours.db'
    : path.join(__dirname, 'data', 'workhours.db'));

function createDb(dbPath = DB_PATH) {
  if (dbPath !== ':memory:') {
    require('node:fs').mkdirSync(path.dirname(dbPath), { recursive: true });
  }
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

    CREATE TABLE IF NOT EXISTS app_settings (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      manager_pin_hash TEXT NOT NULL,
      manager_pin_salt TEXT NOT NULL
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
  `);
  // Seed the default manager PIN (0000) on first run; the manager
  // changes it from the app.
  const hasSettings = db.prepare('SELECT id FROM app_settings WHERE id = 1').get();
  if (!hasSettings) {
    const { makePinHash } = require('./auth');
    const { hash, salt } = makePinHash('0000');
    db.prepare(
      'INSERT INTO app_settings (id, manager_pin_hash, manager_pin_salt) VALUES (1, ?, ?)'
    ).run(hash, salt);
  }
  return db;
}

module.exports = { createDb, DB_PATH };
