'use strict';

process.env.STORAGE = 'sqlite';
process.env.DB_PATH = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { server } = require('../server');

let base;
const MANAGER = 'Bearer manager:0000';

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, body, auth = MANAGER) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('login', async () => {
  const bad = await call('POST', '/api/login', { role: 'manager', pin: '9999' }, null);
  assert.strictEqual(bad.status, 401);

  const good = await call('POST', '/api/login', { role: 'manager', pin: '0000' }, null);
  assert.strictEqual(good.status, 200);
  assert.strictEqual(good.data.role, 'manager');
});

test('unauthenticated and worker-forbidden requests', async () => {
  const noAuth = await call('GET', '/api/employees', undefined, null);
  assert.strictEqual(noAuth.status, 401);

  const emp = (await call('POST', '/api/employees', { name: 'Worker One', pin: '1111' })).data;
  const workerAuth = `Bearer worker:${emp.id}:1111`;

  const createForbidden = await call('POST', '/api/employees', { name: 'Nope' }, workerAuth);
  assert.strictEqual(createForbidden.status, 403);

  const deleteForbidden = await call('DELETE', `/api/employees/${emp.id}`, undefined, workerAuth);
  assert.strictEqual(deleteForbidden.status, 403);

  const wrongPin = await call('GET', '/api/employees', undefined, `Bearer worker:${emp.id}:2222`);
  assert.strictEqual(wrongPin.status, 401);
});

test('employee CRUD as manager', async () => {
  const created = await call('POST', '/api/employees', {
    name: 'Alice Cohen',
    email: 'alice@example.com',
    pin: '4321',
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.name, 'Alice Cohen');
  assert.ok(!('pin_hash' in created.data));
  assert.ok(created.data.has_pin);

  const dup = await call('POST', '/api/employees', { name: 'X', email: 'alice@example.com' });
  assert.strictEqual(dup.status, 409);

  const badPin = await call('POST', '/api/employees', { name: 'Y', pin: 'abc' });
  assert.strictEqual(badPin.status, 400);

  const updated = await call('PUT', `/api/employees/${created.data.id}`, { name: 'Alice Cohen-Levi' });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.data.name, 'Alice Cohen-Levi');
  assert.strictEqual(updated.data.email, 'alice@example.com');

  const workerLogin = await call(
    'POST',
    '/api/login',
    { role: 'worker', employee_id: created.data.id, pin: '4321' },
    null
  );
  assert.strictEqual(workerLogin.status, 200);
  assert.strictEqual(workerLogin.data.employee.name, 'Alice Cohen-Levi');
});

test('worker sees only their own data', async () => {
  const a = (await call('POST', '/api/employees', { name: 'Scope A', pin: '1010' })).data;
  const b = (await call('POST', '/api/employees', { name: 'Scope B', pin: '2020' })).data;
  const authA = `Bearer worker:${a.id}:1010`;

  await call('POST', '/api/entries', {
    employee_id: a.id,
    clock_in: '2026-08-25T09:00:00Z',
    clock_out: '2026-08-25T12:00:00Z',
  });
  await call('POST', '/api/entries', {
    employee_id: b.id,
    clock_in: '2026-08-25T09:00:00Z',
    clock_out: '2026-08-25T13:00:00Z',
  });

  const employees = await call('GET', '/api/employees', undefined, authA);
  assert.strictEqual(employees.data.length, 1);
  assert.strictEqual(employees.data[0].id, a.id);

  const entries = await call('GET', `/api/entries?employee_id=${b.id}`, undefined, authA);
  assert.ok(entries.data.every((e) => e.employee_id === a.id));

  const createOther = await call(
    'POST',
    '/api/entries',
    { employee_id: b.id, clock_in: '2026-08-26T09:00:00Z', clock_out: '2026-08-26T10:00:00Z' },
    authA
  );
  assert.strictEqual(createOther.status, 403);

  const bEntry = (await call('GET', `/api/entries?employee_id=${b.id}`)).data[0];
  const editOther = await call('PUT', `/api/entries/${bEntry.id}`, { break_minutes: 10 }, authA);
  assert.strictEqual(editOther.status, 403);

  const clockOther = await call('POST', `/api/employees/${b.id}/clock-in`, undefined, authA);
  assert.strictEqual(clockOther.status, 403);

  const report = await call('GET', '/api/reports/summary?from=2026-08-25&to=2026-08-25', undefined, authA);
  assert.strictEqual(report.data.length, 1);
  assert.strictEqual(report.data[0].employee_id, a.id);

  const managerReport = await call('GET', '/api/reports/summary?from=2026-08-25&to=2026-08-25');
  assert.ok(managerReport.data.length >= 2);
});

test('worker can clock in and out themselves', async () => {
  const emp = (await call('POST', '/api/employees', { name: 'Bob Levi', pin: '3030' })).data;
  const workerAuth = `Bearer worker:${emp.id}:3030`;

  const clockIn = await call('POST', `/api/employees/${emp.id}/clock-in`, undefined, workerAuth);
  assert.strictEqual(clockIn.status, 201);

  const again = await call('POST', `/api/employees/${emp.id}/clock-in`, undefined, workerAuth);
  assert.strictEqual(again.status, 409);

  const clockOut = await call('POST', `/api/employees/${emp.id}/clock-out`, { break_minutes: 0 }, workerAuth);
  assert.strictEqual(clockOut.status, 200);
  assert.ok(clockOut.data.hours >= 0);
});

test('manual entries and validation', async () => {
  const emp = (await call('POST', '/api/employees', { name: 'Carol Mizrahi' })).data;

  const entry = await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-08-31T09:00:00Z',
    clock_out: '2026-08-31T17:30:00Z',
    break_minutes: 30,
    notes: 'regular day',
  });
  assert.strictEqual(entry.status, 201);
  assert.strictEqual(entry.data.hours, 8);

  const backwards = await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-08-31T17:00:00Z',
    clock_out: '2026-08-31T09:00:00Z',
  });
  assert.strictEqual(backwards.status, 400);

  const edited = await call('PUT', `/api/entries/${entry.data.id}`, { break_minutes: 60 });
  assert.strictEqual(edited.status, 200);
  assert.strictEqual(edited.data.hours, 7.5);
});

test('summary report and CSV as manager', async () => {
  const report = await call('GET', '/api/reports/summary?from=2026-08-31&to=2026-08-31');
  assert.strictEqual(report.status, 200);
  const carol = report.data.find((r) => r.employee_name === 'Carol Mizrahi');
  assert.ok(carol);
  assert.strictEqual(carol.total_hours, 7.5);

  const csvRes = await fetch(base + '/api/reports/summary.csv?from=2026-08-31&to=2026-08-31', {
    headers: { Authorization: MANAGER },
  });
  assert.strictEqual(csvRes.status, 200);
  const csv = await csvRes.text();
  assert.ok(csv.includes('Carol Mizrahi'));
});

test('monthly timesheet report', async () => {
  const emp = (await call('POST', '/api/employees', { name: 'Monthly Moshe', pin: '7070' })).data;
  const workerAuth = `Bearer worker:${emp.id}:7070`;

  // Two shifts on one day, plus a second day.
  await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-07-01T06:00:00Z',
    clock_out: '2026-07-01T10:00:00Z',
    break_minutes: 30,
  });
  await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-07-01T12:00:00Z',
    clock_out: '2026-07-01T15:00:00Z',
  });
  await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-07-02T08:00:00Z',
    clock_out: '2026-07-02T16:00:00Z',
    break_minutes: 60,
  });

  const report = await call('GET', `/api/reports/monthly?employee_id=${emp.id}&month=2026-07`);
  assert.strictEqual(report.status, 200);
  assert.strictEqual(report.data.employee.name, 'Monthly Moshe');
  assert.strictEqual(report.data.from, '2026-07-01');
  assert.strictEqual(report.data.to, '2026-07-31');
  assert.strictEqual(report.data.days.length, 31, 'every day of the month gets a row');

  const first = report.data.days[0];
  assert.strictEqual(first.shifts.length, 2);
  assert.strictEqual(first.gross_minutes, 7 * 60);
  assert.strictEqual(first.net_minutes, 7 * 60 - 30);
  assert.strictEqual(first.weekday, 3, '2026-07-01 is a Wednesday');

  const second = report.data.days[1];
  assert.strictEqual(second.net_minutes, 7 * 60);

  const empty = report.data.days[5];
  assert.deepStrictEqual(empty.shifts, []);
  assert.strictEqual(empty.gross_minutes, 0);

  assert.strictEqual(report.data.totals.days_worked, 2);
  assert.strictEqual(report.data.totals.net_minutes, 7 * 60 - 30 + 7 * 60);

  // A worker gets their own month and cannot request someone else's.
  const own = await call('GET', '/api/reports/monthly?month=2026-07', undefined, workerAuth);
  assert.strictEqual(own.status, 200);
  assert.strictEqual(own.data.employee.id, emp.id);

  const other = (await call('POST', '/api/employees', { name: 'Someone Else' })).data;
  const scoped = await call(
    'GET',
    `/api/reports/monthly?employee_id=${other.id}&month=2026-07`,
    undefined,
    workerAuth
  );
  assert.strictEqual(scoped.data.employee.id, emp.id, 'employee_id is ignored for workers');

  const badMonth = await call('GET', `/api/reports/monthly?employee_id=${emp.id}&month=2026-13`);
  assert.strictEqual(badMonth.status, 400);

  const noAuth = await call('GET', '/api/reports/monthly?month=2026-07', undefined, null);
  assert.strictEqual(noAuth.status, 401);
});

test('change manager PIN', async () => {
  const change = await call('POST', '/api/settings/manager-pin', { new_pin: '5555' });
  assert.strictEqual(change.status, 200);

  const oldPin = await call('GET', '/api/employees');
  assert.strictEqual(oldPin.status, 401);

  const newAuth = 'Bearer manager:5555';
  const works = await call('GET', '/api/employees', undefined, newAuth);
  assert.strictEqual(works.status, 200);

  const restore = await call('POST', '/api/settings/manager-pin', { new_pin: '0000' }, newAuth);
  assert.strictEqual(restore.status, 200);
});

test('login employee picker is public, static files served', async () => {
  const picker = await call('GET', '/api/login/employees', undefined, null);
  assert.strictEqual(picker.status, 200);
  assert.ok(picker.data.length > 0);
  assert.ok(picker.data.every((e) => 'has_pin' in e && !('email' in e)));

  const res = await fetch(base + '/');
  assert.strictEqual(res.status, 200);
  assert.ok((await res.text()).includes('Work Hours'));
});
