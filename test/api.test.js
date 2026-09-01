'use strict';

process.env.DB_PATH = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { server } = require('../server');

let base;

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('employee CRUD', async () => {
  const created = await call('POST', '/api/employees', {
    name: 'Alice Cohen',
    email: 'alice@example.com',
    role: 'Engineer',
    hourly_rate: 50,
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.name, 'Alice Cohen');

  const dup = await call('POST', '/api/employees', { name: 'X', email: 'alice@example.com' });
  assert.strictEqual(dup.status, 409);

  const missingName = await call('POST', '/api/employees', { email: 'y@example.com' });
  assert.strictEqual(missingName.status, 400);

  const updated = await call('PUT', `/api/employees/${created.data.id}`, { role: 'Lead' });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.data.role, 'Lead');
  assert.strictEqual(updated.data.name, 'Alice Cohen');

  const list = await call('GET', '/api/employees');
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.data.length, 1);
});

test('clock in and out', async () => {
  const emp = (await call('POST', '/api/employees', { name: 'Bob Levi' })).data;

  const clockIn = await call('POST', `/api/employees/${emp.id}/clock-in`);
  assert.strictEqual(clockIn.status, 201);
  assert.strictEqual(clockIn.data.clock_out, null);

  const again = await call('POST', `/api/employees/${emp.id}/clock-in`);
  assert.strictEqual(again.status, 409);

  const open = await call('GET', '/api/entries?open=true');
  assert.ok(open.data.some((e) => e.employee_id === emp.id));

  const clockOut = await call('POST', `/api/employees/${emp.id}/clock-out`, { break_minutes: 0 });
  assert.strictEqual(clockOut.status, 200);
  assert.ok(clockOut.data.clock_out);
  assert.ok(clockOut.data.hours >= 0);

  const notIn = await call('POST', `/api/employees/${emp.id}/clock-out`);
  assert.strictEqual(notIn.status, 409);
});

test('manual entries and validation', async () => {
  const emp = (await call('POST', '/api/employees', { name: 'Carol Mizrahi', hourly_rate: 40 })).data;

  const entry = await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-08-31T09:00:00Z',
    clock_out: '2026-08-31T17:30:00Z',
    break_minutes: 30,
    notes: 'regular day',
  });
  assert.strictEqual(entry.status, 201);
  assert.strictEqual(entry.data.hours, 8);
  assert.strictEqual(entry.data.work_date, '2026-08-31');

  const backwards = await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-08-31T17:00:00Z',
    clock_out: '2026-08-31T09:00:00Z',
  });
  assert.strictEqual(backwards.status, 400);

  const badBreak = await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-08-31T09:00:00Z',
    clock_out: '2026-08-31T10:00:00Z',
    break_minutes: -5,
  });
  assert.strictEqual(badBreak.status, 400);

  const edited = await call('PUT', `/api/entries/${entry.data.id}`, { break_minutes: 60 });
  assert.strictEqual(edited.status, 200);
  assert.strictEqual(edited.data.hours, 7.5);

  const filtered = await call('GET', `/api/entries?employee_id=${emp.id}&from=2026-08-01&to=2026-08-31`);
  assert.strictEqual(filtered.data.length, 1);
});

test('summary report and CSV', async () => {
  const report = await call('GET', '/api/reports/summary?from=2026-08-01&to=2026-08-31');
  assert.strictEqual(report.status, 200);
  const carol = report.data.find((r) => r.employee_name === 'Carol Mizrahi');
  assert.ok(carol);
  assert.strictEqual(carol.total_hours, 7.5);
  assert.strictEqual(carol.total_pay, 300);
  assert.strictEqual(carol.days_worked, 1);

  const missingRange = await call('GET', '/api/reports/summary');
  assert.strictEqual(missingRange.status, 400);

  const csvRes = await fetch(base + '/api/reports/summary.csv?from=2026-08-01&to=2026-08-31');
  assert.strictEqual(csvRes.status, 200);
  const csv = await csvRes.text();
  assert.ok(csv.includes('Carol Mizrahi'));
  assert.ok(csv.startsWith('Employee,Total Hours'));
});

test('deleting employee cascades to entries', async () => {
  const emp = (await call('POST', '/api/employees', { name: 'Dana Temp' })).data;
  await call('POST', '/api/entries', {
    employee_id: emp.id,
    clock_in: '2026-08-30T09:00:00Z',
    clock_out: '2026-08-30T12:00:00Z',
  });
  const del = await call('DELETE', `/api/employees/${emp.id}`);
  assert.strictEqual(del.status, 200);
  const entries = await call('GET', `/api/entries?employee_id=${emp.id}`);
  assert.strictEqual(entries.data.length, 0);
});

test('static frontend is served', async () => {
  const res = await fetch(base + '/');
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Work Hours'));

  const traversal = await fetch(base + '/..%2Fserver.js');
  assert.notStrictEqual(traversal.status, 200);
});
