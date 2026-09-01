'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const store = require('./store');
const { HttpError } = require('./errors');
const { makePinHash, pinMatches, validatePinFormat, parseAuthHeader } = require('./auth');

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

// ---------- authentication ----------

// Credentials are verified against the database on every request; there is
// no server-side session state.
async function authenticate(req) {
  const cred = parseAuthHeader(req);
  if (!cred) return null;
  if (cred.role === 'manager') {
    const settings = await store.getSettings();
    if (settings && pinMatches(cred.pin, settings.manager_pin_hash, settings.manager_pin_salt)) {
      return { role: 'manager' };
    }
    return null;
  }
  if (!Number.isInteger(cred.employeeId)) return null;
  const emp = await store.getEmployeeSecret(cred.employeeId);
  if (emp && emp.active && emp.pin_hash && pinMatches(cred.pin, emp.pin_hash, emp.pin_salt)) {
    return { role: 'worker', employeeId: emp.id };
  }
  return null;
}

async function requireAuth(req) {
  const auth = await authenticate(req);
  if (!auth) throw new HttpError(401, 'Authentication required');
  return auth;
}

function requireManager(auth) {
  if (auth.role !== 'manager') throw new HttpError(403, 'Manager access required');
}

function requireSelfOrManager(auth, employeeId) {
  if (auth.role !== 'manager' && auth.employeeId !== Number(employeeId)) {
    throw new HttpError(403, 'Access limited to your own records');
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

// --- login ---

// Names only, for the login screen's worker picker.
route('GET', '/api/login/employees', async (req, res) => {
  const employees = await store.listEmployees(true);
  sendJson(res, 200, employees.map(({ id, name, has_pin }) => ({ id, name, has_pin: !!has_pin })));
});

route('POST', '/api/login', async (req, res) => {
  const body = await readBody(req);
  const fakeReq = {
    headers: {
      authorization:
        body.role === 'manager'
          ? `Bearer manager:${body.pin}`
          : `Bearer worker:${body.employee_id}:${body.pin}`,
    },
  };
  const auth = await authenticate(fakeReq);
  if (!auth) throw new HttpError(401, 'Wrong PIN');
  if (auth.role === 'worker') {
    const emp = await getEmployeeOrThrow(auth.employeeId);
    return sendJson(res, 200, { role: 'worker', employee: { id: emp.id, name: emp.name } });
  }
  sendJson(res, 200, { role: 'manager' });
});

route('POST', '/api/settings/manager-pin', async (req, res) => {
  const auth = await requireAuth(req);
  requireManager(auth);
  const body = await readBody(req);
  validatePinFormat(body.new_pin);
  const { hash, salt } = makePinHash(String(body.new_pin));
  await store.setManagerPin(hash, salt);
  sendJson(res, 200, { ok: true });
});

// --- employees ---

route('GET', '/api/employees', async (req, res, params, query) => {
  const auth = await requireAuth(req);
  if (auth.role === 'worker') {
    return sendJson(res, 200, [await getEmployeeOrThrow(auth.employeeId)]);
  }
  sendJson(res, 200, await store.listEmployees(query.get('active') === 'true'));
});

route('POST', '/api/employees', async (req, res) => {
  const auth = await requireAuth(req);
  requireManager(auth);
  const body = await readBody(req);
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'name is required');
  const email = body.email ? String(body.email).trim() : null;
  const fields = { name, email };
  if (body.pin) {
    validatePinFormat(body.pin);
    const { hash, salt } = makePinHash(String(body.pin));
    fields.pin_hash = hash;
    fields.pin_salt = salt;
  }
  sendJson(res, 201, await store.createEmployee(fields));
});

route('PUT', '/api/employees/:id', async (req, res, params) => {
  const auth = await requireAuth(req);
  requireManager(auth);
  const emp = await getEmployeeOrThrow(params.id);
  const body = await readBody(req);
  const name = body.name !== undefined ? String(body.name).trim() : emp.name;
  if (!name) throw new HttpError(400, 'name cannot be empty');
  const email =
    body.email !== undefined ? (body.email ? String(body.email).trim() : null) : emp.email;
  const active = body.active !== undefined ? !!body.active : !!emp.active;
  const fields = { name, email, active };
  if (body.pin) {
    validatePinFormat(body.pin);
    const { hash, salt } = makePinHash(String(body.pin));
    fields.pin_hash = hash;
    fields.pin_salt = salt;
  }
  sendJson(res, 200, await store.updateEmployee(emp.id, fields));
});

route('DELETE', '/api/employees/:id', async (req, res, params) => {
  const auth = await requireAuth(req);
  requireManager(auth);
  await getEmployeeOrThrow(params.id);
  await store.deleteEmployee(params.id);
  sendJson(res, 200, { ok: true });
});

// --- clock in / out ---

route('POST', '/api/employees/:id/clock-in', async (req, res, params) => {
  const auth = await requireAuth(req);
  requireSelfOrManager(auth, params.id);
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
  const auth = await requireAuth(req);
  requireSelfOrManager(auth, params.id);
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

route('GET', '/api/entries', async (req, res, params, query) => {
  const auth = await requireAuth(req);
  const filters = {};
  const empId = query.get('employee_id');
  if (empId) filters.employeeId = Number(empId);
  if (auth.role === 'worker') filters.employeeId = auth.employeeId;
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
  const rows = await store.listEntries(filters);
  sendJson(res, 200, rows.map(withHours));
});

route('POST', '/api/entries', async (req, res) => {
  const auth = await requireAuth(req);
  const body = await readBody(req);
  const employeeId = auth.role === 'worker' ? auth.employeeId : Number(body.employee_id);
  if (auth.role === 'worker' && body.employee_id && Number(body.employee_id) !== auth.employeeId) {
    throw new HttpError(403, 'Access limited to your own records');
  }
  const emp = await getEmployeeOrThrow(employeeId);
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
  const auth = await requireAuth(req);
  const entry = await getEntryOrThrow(params.id);
  requireSelfOrManager(auth, entry.employee_id);
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
  const auth = await requireAuth(req);
  const entry = await getEntryOrThrow(params.id);
  requireSelfOrManager(auth, entry.employee_id);
  await store.deleteEntry(params.id);
  sendJson(res, 200, { ok: true });
});

// --- reports ---

async function buildReport(query, auth) {
  const from = query.get('from');
  const to = query.get('to');
  if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
    throw new HttpError(400, 'from and to (YYYY-MM-DD) are required');
  }
  let rows = await store.completedEntries(from, to);
  if (auth.role === 'worker') {
    rows = rows.filter((row) => row.employee_id === auth.employeeId);
  }
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

// Per-day timesheet for one employee over one calendar month, laid out like a
// payroll "hours split" report: every date in the month gets a row, worked or not.
route('GET', '/api/reports/monthly', async (req, res, params, query) => {
  const auth = await requireAuth(req);
  const month = query.get('month') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new HttpError(400, 'month must be YYYY-MM');
  }
  const employeeId = auth.role === 'worker' ? auth.employeeId : Number(query.get('employee_id'));
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new HttpError(400, 'employee_id is required');
  }
  const emp = await getEmployeeOrThrow(employeeId);
  const [year, monthNum] = month.split('-').map(Number);
  const dayCount = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(dayCount).padStart(2, '0')}`;

  const byDate = new Map();
  for (const entry of await store.listEntries({ employeeId: emp.id, from, to })) {
    if (!byDate.has(entry.work_date)) byDate.set(entry.work_date, []);
    byDate.get(entry.work_date).push(entry);
  }

  const days = [];
  const totals = { gross_minutes: 0, net_minutes: 0, days_worked: 0 };
  for (let d = 1; d <= dayCount; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const shifts = (byDate.get(date) || []).sort((a, b) => a.clock_in.localeCompare(b.clock_in));
    let gross = 0;
    let net = 0;
    for (const shift of shifts) {
      if (!shift.clock_out) continue;
      const span = Math.max(0, Math.round((new Date(shift.clock_out) - new Date(shift.clock_in)) / 60000));
      gross += span;
      net += Math.max(0, span - shift.break_minutes);
    }
    if (net > 0) totals.days_worked += 1;
    totals.gross_minutes += gross;
    totals.net_minutes += net;
    days.push({
      date,
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      shifts: shifts.map((s) => ({ clock_in: s.clock_in, clock_out: s.clock_out })),
      gross_minutes: gross,
      net_minutes: net,
    });
  }

  sendJson(res, 200, { employee: { id: emp.id, name: emp.name }, from, to, days, totals });
});

route('GET', '/api/reports/summary', async (req, res, params, query) => {
  const auth = await requireAuth(req);
  sendJson(res, 200, await buildReport(query, auth));
});

route('GET', '/api/reports/summary.csv', async (req, res, params, query) => {
  const auth = await requireAuth(req);
  const report = await buildReport(query, auth);
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
