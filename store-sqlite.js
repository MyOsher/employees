'use strict';

const { createDb } = require('./db');
const { HttpError } = require('./errors');

function mapConflict(err) {
  if (String(err.message).includes('UNIQUE')) {
    return new HttpError(409, 'An employee with this email already exists');
  }
  return err;
}

// Public employee reads never include the PIN columns.
const EMP_COLS = 'id, name, email, active, created_at, (pin_hash IS NOT NULL) AS has_pin';

function createStore(business) {
  const db = createDb(business.sqliteFile);

  const api = {
    listEmployees(activeOnly) {
      let sql = `SELECT ${EMP_COLS} FROM employees`;
      if (activeOnly) sql += ' WHERE active = 1';
      return db.prepare(sql + ' ORDER BY name COLLATE NOCASE').all();
    },

    getEmployee(id) {
      return db.prepare(`SELECT ${EMP_COLS} FROM employees WHERE id = ?`).get(id) || null;
    },

    getEmployeeSecret(id) {
      return (
        db.prepare('SELECT id, active, pin_hash, pin_salt FROM employees WHERE id = ?').get(id) || null
      );
    },

    createEmployee({ name, email = null, pin_hash = null, pin_salt = null }) {
      try {
        const info = db
          .prepare('INSERT INTO employees (name, email, pin_hash, pin_salt) VALUES (?, ?, ?, ?)')
          .run(name, email, pin_hash, pin_salt);
        return api.getEmployee(info.lastInsertRowid);
      } catch (err) {
        throw mapConflict(err);
      }
    },

    updateEmployee(id, { name, email, active, pin_hash, pin_salt }) {
      try {
        db.prepare('UPDATE employees SET name = ?, email = ?, active = ? WHERE id = ?').run(
          name,
          email,
          active ? 1 : 0,
          id
        );
        if (pin_hash !== undefined) {
          db.prepare('UPDATE employees SET pin_hash = ?, pin_salt = ? WHERE id = ?').run(
            pin_hash,
            pin_salt,
            id
          );
        }
      } catch (err) {
        throw mapConflict(err);
      }
      return api.getEmployee(id);
    },

    deleteEmployee(id) {
      db.prepare('DELETE FROM employees WHERE id = ?').run(id);
    },

    getEntry(id) {
      return (
        db
          .prepare(
            `SELECT e.*, emp.name AS employee_name
               FROM time_entries e JOIN employees emp ON emp.id = e.employee_id
              WHERE e.id = ?`
          )
          .get(id) || null
      );
    },

    getOpenEntry(employeeId) {
      return (
        db
          .prepare('SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL')
          .get(employeeId) || null
      );
    },

    listEntries({ employeeId, from, to, open } = {}) {
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
    },

    createEntry({ employee_id, work_date, clock_in, clock_out, break_minutes, notes }) {
      const info = db
        .prepare(
          `INSERT INTO time_entries (employee_id, work_date, clock_in, clock_out, break_minutes, notes)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(employee_id, work_date, clock_in, clock_out, break_minutes, notes);
      return api.getEntry(info.lastInsertRowid);
    },

    updateEntry(id, { work_date, clock_in, clock_out, break_minutes, notes }) {
      db.prepare(
        `UPDATE time_entries
            SET work_date = ?, clock_in = ?, clock_out = ?, break_minutes = ?, notes = ?
          WHERE id = ?`
      ).run(work_date, clock_in, clock_out, break_minutes, notes, id);
      return api.getEntry(id);
    },

    deleteEntry(id) {
      db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
    },

    completedEntries(from, to) {
      return db
        .prepare(
          `SELECT e.*, emp.name AS employee_name
             FROM time_entries e JOIN employees emp ON emp.id = e.employee_id
            WHERE e.work_date >= ? AND e.work_date <= ? AND e.clock_out IS NOT NULL`
        )
        .all(from, to);
    },

    getSettings() {
      return db.prepare('SELECT * FROM app_settings WHERE id = 1').get() || null;
    },

    setManagerPin(hash, salt) {
      db.prepare(
        'UPDATE app_settings SET manager_pin_hash = ?, manager_pin_salt = ? WHERE id = 1'
      ).run(hash, salt);
    },

    setDailyStandard(minutes) {
      db.prepare('UPDATE app_settings SET daily_standard_minutes = ? WHERE id = 1').run(minutes);
    },
  };

  // Same async surface as the Supabase store; SQLite calls are synchronous
  // underneath, which async functions absorb transparently.
  return Object.fromEntries(
    Object.entries(api).map(([name, fn]) => [name, async (...args) => fn(...args)])
  );
}

module.exports = { createStore };
