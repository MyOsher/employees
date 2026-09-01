'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const store = require('./store');
const { HttpError } = require('./errors');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- helpers ----------

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

async function getEmployeeOrThrow(id) {
  const emp = await store.getEmployee(id);
  if (!emp) throw new HttpError(404, 'Employee not found');
  return emp;
}

async function getEntryOrThrow(id) {
  const entry = await store.getEntry(id);
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

route('GET', '/api/employees', async (req, res, params, query) => {
  sendJson(res, 200, await store.listEmployees(query.get('active') === 'true'));
});

route('POST', '/api/employees', async (req, res) => {
  const body = await readBody(req);
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'name is required');
  const email = body.email ? String(body.email).trim() : null;
  const emp = await store.createEmployee({ name, email });
  sendJson(res, 201, emp);
});

route('PUT', '/api/employees/:id', async (req, res, params) => {
  const emp = await getEmployeeOrThrow(params.id);
  const body = await readBody(req);
  const name = body.name !== undefined ? String(body.name).trim() : emp.name;
  if (!name) throw new HttpError(400, 'name cannot be empty');
  const email =
    body.email !== undefined ? (body.email ? String(body.email).trim() : null) : emp.email;
  const active = body.active !== undefined ? !!body.active : !!emp.active;
  const updated = await store.updateEmployee(emp.id, { name, email, active });
  sendJson(res, 200, updated);
});

route('DELETE', '/api/employees/:id', async (req, res, params) => {
  await getEmployeeOrThrow(params.id);
  await store.deleteEmployee(params.id);
  sendJson(res, 200, { ok: true });
});

// --- clock in / out ---

route('POST', '/api/employees/:id/clock-in', async (req, res, params) => {
  const emp = await getEmployeeOrThrow(params.id);
  if (!emp.active) throw new HttpError(400, 'Employee is inactive');
  if (await store.getOpenEntry(emp.id)) {
    throw new HttpError(409, 'Employee is already clocked in');
  }
  const now = new Date().toISOString();
  const entry = await store.createEntry({
    employee_id: emp.id,
    work_date: now.slice(0, 10),
    clock_in: now,
    clock_out: null,
    break_minutes: 0,
    notes: '',
  });
  sendJson(res, 201, withHours(entry));
});

route('POST', '/api/employees/:id/clock-out', async (req, res, params) => {
  const emp = await getEmployeeOrThrow(params.id);
  const open = await store.getOpenEntry(emp.id);
  if (!open) throw new HttpError(409, 'Employee is not clocked in');
  const body = await readBody(req);
  const breakMinutes = Number.isInteger(body.break_minutes) ? body.break_minutes : 0;
  const now = new Date().toISOString();
  validateEntryTimes(open.clock_in, now, breakMinutes);
  const updated = await store.updateEntry(open.id, {
    work_date: open.work_date,
    clock_in: open.clock_in,
    clock_out: now,
    break_minutes: breakMinutes,
    notes: String(body.notes || open.notes || ''),
  });
  sendJson(res, 200, withHours(updated));
});

// --- time entries ---

route('GET', '/api/entries', (req, res, params, query) => {
  const filters = {};
  const empId = query.get('employee_id');
  if (empId) filters.employeeId = Number(empId);
  const from = query.get('from');
  if (from) {
    if (!DATE_RE.test(from)) throw new HttpError(400, 'from must be YYYY-MM-DD');
    filters.from = from;
  }
  const to = query.get('to');
  if (to) {
    if (!DATE_RE.test(to)) throw new HttpError(400, 'to must be YYYY-MM-DD');
    filters.to = to;
  }
  if (query.get('open') === 'true') filters.open = true;
  return store.listEntries(filters).then((rows) => sendJson(res, 200, rows.map(withHours)));
});

route('POST', '/api/entries', async (req, res) => {
  const body = await readBody(req);
  const emp = await getEmployeeOrThrow(Number(body.employee_id));
  const clockIn = parseIsoOrThrow(body.clock_in, 'clock_in');
  const clockOut = body.clock_out ? parseIsoOrThrow(body.clock_out, 'clock_out') : null;
  const breakMinutes = body.break_minutes === undefined ? 0 : body.break_minutes;
  validateEntryTimes(clockIn, clockOut, breakMinutes);
  const workDate =
    body.work_date && DATE_RE.test(body.work_date) ? body.work_date : clockIn.slice(0, 10);
  const entry = await store.createEntry({
    employee_id: emp.id,
    work_date: workDate,
    clock_in: clockIn,
    clock_out: clockOut,
    break_minutes: breakMinutes,
    notes: String(body.notes || ''),
  });
  sendJson(res, 201, withHours(entry));
});

route('PUT', '/api/entries/:id', async (req, res, params) => {
  const entry = await getEntryOrThrow(params.id);
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
  let workDate = entry.work_date;
  if (body.work_date !== undefined) {
    if (!DATE_RE.test(String(body.work_date))) {
      throw new HttpError(400, 'work_date must be YYYY-MM-DD');
    }
    workDate = body.work_date;
  }
  const notes = body.notes !== undefined ? String(body.notes) : entry.notes;
  const updated = await store.updateEntry(entry.id, {
    work_date: workDate,
    clock_in: clockIn,
    clock_out: clockOut,
    break_minutes: breakMinutes,
    notes,
  });
  sendJson(res, 200, withHours(updated));
});

route('DELETE', '/api/entries/:id', async (req, res, params) => {
  await getEntryOrThrow(params.id);
  await store.deleteEntry(params.id);
  sendJson(res, 200, { ok: true });
});

// --- reports ---

async function buildReport(query) {
  const from = query.get('from');
  const to = query.get('to');
  if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
    throw new HttpError(400, 'from and to (YYYY-MM-DD) are required');
  }
  const rows = await store.completedEntries(from, to);
  const byEmployee = new Map();
  for (const row of rows) {
    const hours = entryHours(row);
    let agg = byEmployee.get(row.employee_id);
    if (!agg) {
      agg = {
        employee_id: row.employee_id,
        employee_name: row.employee_name,
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
  return [...byEmployee.values()]
    .map((agg) => ({ ...agg, days_worked: agg.days_worked.size }))
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

route('GET', '/api/reports/summary', async (req, res, params, query) => {
  sendJson(res, 200, await buildReport(query));
});

route('GET', '/api/reports/summary.csv', async (req, res, params, query) => {
  const report = await buildReport(query);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ['Employee,Total Hours,Days Worked,Entries'];
  for (const r of report) {
    lines.push([esc(r.employee_name), r.total_hours, r.days_worked, r.entries].join(','));
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
// directly, while `server` keeps local `node server.js` and tests working.
module.exports = handleRequest;
module.exports.server = server;
