'use strict';

const { createDb } = require('./db');
const { HttpError } = require('./errors');

const db = createDb();

function mapConflict(err) {
  if (String(err.message).includes('UNIQUE')) {
    return new HttpError(409, 'An employee with this email already exists');
  }
  return err;
}

function listEmployees(activeOnly) {
  let sql = 'SELECT * FROM employees';
  if (activeOnly) sql += ' WHERE active = 1';
  sql += ' ORDER BY name COLLATE NOCASE';
  return db.prepare(sql).all();
}

function getEmployee(id) {
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id) || null;
}

function createEmployee({ name, email, role, hourly_rate }) {
  try {
    const info = db
      .prepare('INSERT INTO employees (name, email, role, hourly_rate) VALUES (?, ?, ?, ?)')
      .run(name, email, role, hourly_rate);
    return getEmployee(info.lastInsertRowid);
  } catch (err) {
    throw mapConflict(err);
  }
}

function updateEmployee(id, { name, email, role, hourly_rate, active }) {
  try {
    db.prepare(
      'UPDATE employees SET name = ?, email = ?, role = ?, hourly_rate = ?, active = ? WHERE id = ?'
    ).run(name, email, role, hourly_rate, active ? 1 : 0, id);
  } catch (err) {
    throw mapConflict(err);
  }
  return getEmployee(id);
}

function deleteEmployee(id) {
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
}

function getEntry(id) {
  return db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id) || null;
}

function getOpenEntry(employeeId) {
  return (
    db.prepare('SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL').get(employeeId) ||
    null
  );
}

function listEntries({ employeeId, from, to, open } = {}) {
  const clauses = [];
  const args = [];
  if (employeeId) {
    clauses.push('e.employee_id = ?');
    args.push(employeeId);
  }
  if (from) {
    clauses.push('e.work_date >= ?');
    args.push(from);
  }
  if (to) {
    clauses.push('e.work_date <= ?');
    args.push(to);
  }
  if (open) clauses.push('e.clock_out IS NULL');
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  return db
    .prepare(
      `SELECT e.*, emp.name AS employee_name
         FROM time_entries e JOIN employees emp ON emp.id = e.employee_id
         ${where}
         ORDER BY e.work_date DESC, e.clock_in DESC`
    )
    .all(...args);
}

function createEntry({ employee_id, work_date, clock_in, clock_out, break_minutes, notes }) {
  const info = db
    .prepare(
      `INSERT INTO time_entries (employee_id, work_date, clock_in, clock_out, break_minutes, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(employee_id, work_date, clock_in, clock_out, break_minutes, notes);
  return getEntry(info.lastInsertRowid);
}

function updateEntry(id, { work_date, clock_in, clock_out, break_minutes, notes }) {
  db.prepare(
    `UPDATE time_entries
        SET work_date = ?, clock_in = ?, clock_out = ?, break_minutes = ?, notes = ?
      WHERE id = ?`
  ).run(work_date, clock_in, clock_out, break_minutes, notes, id);
  return getEntry(id);
}

function deleteEntry(id) {
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
}

function completedEntries(from, to) {
  return db
    .prepare(
      `SELECT e.*, emp.name AS employee_name, emp.hourly_rate
         FROM time_entries e JOIN employees emp ON emp.id = e.employee_id
        WHERE e.work_date >= ? AND e.work_date <= ? AND e.clock_out IS NOT NULL`
    )
    .all(from, to);
}

// Same async surface as the Supabase store; SQLite calls are synchronous
// underneath, which async functions absorb transparently.
const asyncify = (fn) => async (...args) => fn(...args);

module.exports = Object.fromEntries(
  Object.entries({
    listEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getEntry,
    getOpenEntry,
    listEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    completedEntries,
  }).map(([name, fn]) => [name, asyncify(fn)])
);
