'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'workhours.db');

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
      role        TEXT DEFAULT '',
      hourly_rate REAL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1,
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
  `);
  return db;
}

module.exports = { createDb, DB_PATH };
