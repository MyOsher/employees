'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createDb } = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const db = createDb();

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoOrThrow(value, field) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) {
    throw new HttpError(400, `Invalid or missing ${field}`);
  }
  return d.toISOString();
}

function entryHours(entry) {
  if (!entry.clock_out) return null;
  const ms = new Date(entry.clock_out) - new Date(entry.clock_in);
  const hours = ms / 3600000 - entry.break_minutes / 60;
  return Math.max(0, Math.round(hours * 100) / 100);
}

function withHours(entry) {
  return { ...entry, hours: entryHours(entry) };
}

function getEmployeeOrThrow(id) {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!emp) throw new HttpError(404, 'Employee not found');
  return emp;
}

function getEntryOrThrow(id) {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
  if (!entry) throw new HttpError(404, 'Time entry not found');
  return entry;
}

function validateEntryTimes(clockIn, clockOut, breakMinutes) {
  if (clockOut && new Date(clockOut) <= new Date(clockIn)) {
    throw new HttpError(400, 'clock_out must be after clock_in');
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    throw new HttpError(400, 'break_minutes must be a non-negative integer');
  }
}

// ---------- route handlers ----------

const routes = [];

function route(method, pattern, handler) {
  const names = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:(\w+)/g, (_, name) => {
      names.push(name);
      return '(\\d+)';
    }) + '$'
  );
  routes.push({ method, regex, names, handler });
}

// --- employees ---

route('GET', '/api/employees', (req, res, params, query) => {
  let sql = 'SELECT * FROM employees';
  if (query.get('active') === 'true') sql += ' WHERE active = 1';
  sql += ' ORDER BY name COLLATE NOCASE';
  sendJson(res, 200, db.prepare(sql).all());
});

route('POST', '/api/employees', async (req, res) => {
  const body = await readBody(req);
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'name is required');
  const email = body.email ? String(body.email).trim() : null;
  const role = String(body.role || '').trim();
  const rate = Number(body.hourly_rate) || 0;
  if (rate < 0) throw new HttpError(400, 'hourly_rate must be non-negative');
  try {
    const info = db
      .prepare('INSERT INTO employees (name, email, role, hourly_rate) VALUES (?, ?, ?, ?)')
      .run(name, email, role, rate);
    sendJson(res, 201, getEmployeeOrThrow(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      throw new HttpError(409, 'An employee with this email already exists');
    }
    throw err;
  }
});

route('PUT', '/api/employees/:id', async (req, res, params) => {
  const emp = getEmployeeOrThrow(params.id);
  const body = await readBody(req);
  const name = body.name !== undefined ? String(body.name).trim() : emp.name;
  if (!name) throw new HttpError(400, 'name cannot be empty');
  const email =
    body.email !== undefined ? (body.email ? String(body.email).trim() : null) : emp.email;
  const role = body.role !== undefined ? String(body.role).trim() : emp.role;
  const rate = body.hourly_rate !== undefined ? Number(body.hourly_rate) : emp.hourly_rate;
  if (Number.isNaN(rate) || rate < 0) throw new HttpError(400, 'hourly_rate must be non-negative');
  const active = body.active !== undefined ? (body.active ? 1 : 0) : emp.active;
  try {
    db.prepare(
      'UPDATE employees SET name = ?, email = ?, role = ?, hourly_rate = ?, active = ? WHERE id = ?'
    ).run(name, email, role, rate, active, emp.id);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      throw new HttpError(409, 'An employee with this email already exists');
    }
    throw err;
  }
  sendJson(res, 200, getEmployeeOrThrow(emp.id));
});

route('DELETE', '/api/employees/:id', (req, res, params) => {
  getEmployeeOrThrow(params.id);
  db.prepare('DELETE FROM employees WHERE id = ?').run(params.id);
  sendJson(res, 200, { ok: true });
});

// --- clock in / out ---

route('POST', '/api/employees/:id/clock-in', (req, res, params) => {
  const emp = getEmployeeOrThrow(params.id);
  if (!emp.active) throw new HttpError(400, 'Employee is inactive');
  const open = db
    .prepare('SELECT id FROM time_entries WHERE employee_id = ? AND clock_out IS NULL')
    .get(emp.id);
  if (open) throw new HttpError(409, 'Employee is already clocked in');
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO time_entries (employee_id, work_date, clock_in) VALUES (?, ?, ?)')
    .run(emp.id, now.slice(0, 10), now);
  sendJson(res, 201, withHours(getEntryOrThrow(info.lastInsertRowid)));
});

route('POST', '/api/employees/:id/clock-out', async (req, res, params) => {
  const emp = getEmployeeOrThrow(params.id);
  const open = db
    .prepare('SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL')
    .get(emp.id);
  if (!open) throw new HttpError(409, 'Employee is not clocked in');
  const body = await readBody(req);
  const breakMinutes = Number.isInteger(body.break_minutes) ? body.break_minutes : 0;
  const now = new Date().toISOString();
  validateEntryTimes(open.clock_in, now, breakMinutes);
  db.prepare('UPDATE time_entries SET clock_out = ?, break_minutes = ?, notes = ? WHERE id = ?').run(
    now,
    breakMinutes,
    String(body.notes || open.notes || ''),
    open.id
  );
  sendJson(res, 200, withHours(getEntryOrThrow(open.id)));
});

// --- time entries ---

route('GET', '/api/entries', (req, res, params, query) => {
  const clauses = [];
  const args = [];
  const empId = query.get('employee_id');
  if (empId) {
    clauses.push('e.employee_id = ?');
    args.push(Number(empId));
  }
  const from = query.get('from');
  if (from) {
    if (!DATE_RE.test(from)) throw new HttpError(400, 'from must be YYYY-MM-DD');
    clauses.push('e.work_date >= ?');
    args.push(from);
  }
  const to = query.get('to');
  if (to) {
    if (!DATE_RE.test(to)) throw new HttpError(400, 'to must be YYYY-MM-DD');
    clauses.push('e.work_date <= ?');
    args.push(to);
  }
  if (query.get('open') === 'true') clauses.push('e.clock_out IS NULL');
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const rows = db
    .prepare(
      `SELECT e.*, emp.name AS employee_name
         FROM time_entries e JOIN employees emp ON emp.id = e.employee_id
         ${where}
         ORDER BY e.work_date DESC, e.clock_in DESC`
    )
    .all(...args);
  sendJson(res, 200, rows.map(withHours));
});

route('POST', '/api/entries', async (req, res) => {
  const body = await readBody(req);
  const emp = getEmployeeOrThrow(Number(body.employee_id));
  const clockIn = parseIsoOrThrow(body.clock_in, 'clock_in');
  const clockOut = body.clock_out ? parseIsoOrThrow(body.clock_out, 'clock_out') : null;
  const breakMinutes = body.break_minutes === undefined ? 0 : body.break_minutes;
  validateEntryTimes(clockIn, clockOut, breakMinutes);
  const workDate =
    body.work_date && DATE_RE.test(body.work_date) ? body.work_date : clockIn.slice(0, 10);
  const info = db
    .prepare(
      `INSERT INTO time_entries (employee_id, work_date, clock_in, clock_out, break_minutes, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(emp.id, workDate, clockIn, clockOut, breakMinutes, String(body.notes || ''));
  sendJson(res, 201, withHours(getEntryOrThrow(info.lastInsertRowid)));
});

route('PUT', '/api/entries/:id', async (req, res, params) => {
  const entry = getEntryOrThrow(params.id);
  const body = await readBody(req);
  const clockIn = body.clock_in !== undefined ? parseIsoOrThrow(body.clock_in, 'clock_in') : entry.clock_in;
  const clockOut =
    body.clock_out !== undefined
      ? body.clock_out
        ? parseIsoOrThrow(body.clock_out, 'clock_out')
        : null
      : entry.clock_out;
  const breakMinutes = body.break_minutes !== undefined ? body.break_minutes : entry.break_minutes;
  validateEntryTimes(clockIn, clockOut, breakMinutes);
  const workDate =
    body.work_date !== undefined
      ? DATE_RE.test(String(body.work_date))
        ? body.work_date
        : (() => {
            throw new HttpError(400, 'work_date must be YYYY-MM-DD');
          })()
      : entry.work_date;
  const notes = body.notes !== undefined ? String(body.notes) : entry.notes;
  db.prepare(
    `UPDATE time_entries
        SET work_date = ?, clock_in = ?, clock_out = ?, break_minutes = ?, notes = ?
      WHERE id = ?`
  ).run(workDate, clockIn, clockOut, breakMinutes, notes, entry.id);
  sendJson(res, 200, withHours(getEntryOrThrow(entry.id)));
});

route('DELETE', '/api/entries/:id', (req, res, params) => {
  getEntryOrThrow(params.id);
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(params.id);
  sendJson(res, 200, { ok: true });
});

// --- reports ---

function buildReport(query) {
  const from = query.get('from');
  const to = query.get('to');
  if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
    throw new HttpError(400, 'from and to (YYYY-MM-DD) are required');
  }
  const rows = db
    .prepare(
      `SELECT e.*, emp.name AS employee_name, emp.hourly_rate
         FROM time_entries e JOIN employees emp ON emp.id = e.employee_id
        WHERE e.work_date >= ? AND e.work_date <= ? AND e.clock_out IS NOT NULL
        ORDER BY emp.name COLLATE NOCASE, e.work_date`
    )
    .all(from, to);
  const byEmployee = new Map();
  for (const row of rows) {
    const hours = entryHours(row);
    let agg = byEmployee.get(row.employee_id);
    if (!agg) {
      agg = {
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        hourly_rate: row.hourly_rate,
        total_hours: 0,
        days_worked: new Set(),
        entries: 0,
      };
      byEmployee.set(row.employee_id, agg);
    }
    agg.total_hours = Math.round((agg.total_hours + hours) * 100) / 100;
    agg.days_worked.add(row.work_date);
    agg.entries += 1;
  }
  return [...byEmployee.values()].map((agg) => ({
    ...agg,
    days_worked: agg.days_worked.size,
    total_pay: Math.round(agg.total_hours * agg.hourly_rate * 100) / 100,
  }));
}

route('GET', '/api/reports/summary', (req, res, params, query) => {
  sendJson(res, 200, buildReport(query));
});

route('GET', '/api/reports/summary.csv', (req, res, params, query) => {
  const report = buildReport(query);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ['Employee,Total Hours,Days Worked,Entries,Hourly Rate,Total Pay'];
  for (const r of report) {
    lines.push(
      [esc(r.employee_name), r.total_hours, r.days_worked, r.entries, r.hourly_rate, r.total_pay].join(',')
    );
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="work-hours-report.csv"',
  });
  res.end(lines.join('\n') + '\n');
});

// ---------- static files + dispatch ----------

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    });
    res.end(data);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const match = url.pathname.match(r.regex);
      if (!match) continue;
      const params = {};
      r.names.forEach((name, i) => (params[name] = Number(match[i + 1])));
      await r.handler(req, res, params, url.searchParams);
      return;
    }
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      return serveStatic(req, res, url.pathname);
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Work hours app running at http://localhost:${PORT}`);
  });
}

// Exported as a callable handler so Vercel's Node runtime can invoke it
// directly, while `server`/`db` keep local `node server.js` and tests working.
module.exports = handleRequest;
module.exports.server = server;
module.exports.db = db;
