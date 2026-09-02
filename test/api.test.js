'use strict';

process.env.STORAGE = 'sqlite';
process.env.DB_PATH = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { server } = require('../server');

let base;
// Credentials are per business; 'hanechess' is the default used by most tests.
const MANAGER = 'Bearer manager:hanechess:0000';
const LAADI_MANAGER = 'Bearer manager:laadi:0000';

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
  const bad = await call('POST', '/api/login', { role: 'manager', business: 'hanechess', pin: '9999' }, null);
  assert.strictEqual(bad.status, 401);

  const good = await call('POST', '/api/login', { role: 'manager', business: 'hanechess', pin: '0000' }, null);
  assert.strictEqual(good.status, 200);
  assert.strictEqual(good.data.role, 'manager');
  assert.strictEqual(good.data.business.id, 'hanechess');

  const unknown = await call('POST', '/api/login', { role: 'manager', business: 'nope', pin: '0000' }, null);
  assert.strictEqual(unknown.status, 401);

  const list = await call('GET', '/api/businesses', undefined, null);
  assert.strictEqual(list.status, 200);
  assert.deepStrictEqual(
    list.data.map((b) => b.id),
    ['hanechess', 'laadi']
  );
});

test('unauthenticated and worker-forbidden requests', async () => {
  const noAuth = await call('GET', '/api/employees', undefined, null);
  assert.strictEqual(noAuth.status, 401);

  const emp = (await call('POST', '/api/employees', { name: 'Worker One', pin: '1111' })).data;
  const workerAuth = `Bearer worker:hanechess:${emp.id}:1111`;

  const createForbidden = await call('POST', '/api/employees', { name: 'Nope' }, workerAuth);
  assert.strictEqual(createForbidden.status, 403);

  const deleteForbidden = await call('DELETE', `/api/employees/${emp.id}`, undefined, workerAuth);
  assert.strictEqual(deleteForbidden.status, 403);

  const wrongPin = await call('GET', '/api/employees', undefined, `Bearer worker:hanechess:${emp.id}:2222`);
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
    { role: 'worker', business: 'hanechess', employee_id: created.data.id, pin: '4321' },
    null
  );
  assert.strictEqual(workerLogin.status, 200);
  assert.strictEqual(workerLogin.data.employee.name, 'Alice Cohen-Levi');
});

test('worker sees only their own data', async () => {
  const a = (await call('POST', '/api/employees', { name: 'Scope A', pin: '1010' })).data;
  const b = (await call('POST', '/api/employees', { name: 'Scope B', pin: '2020' })).data;
  const authA = `Bearer worker:hanechess:${a.id}:1010`;

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
  const workerAuth = `Bearer worker:hanechess:${emp.id}:3030`;

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
  const workerAuth = `Bearer worker:hanechess:${emp.id}:7070`;

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

  const newAuth = 'Bearer manager:hanechess:5555';
  const works = await call('GET', '/api/employees', undefined, newAuth);
  assert.strictEqual(works.status, 200);

  const restore = await call('POST', '/api/settings/manager-pin', { new_pin: '0000' }, newAuth);
  assert.strictEqual(restore.status, 200);
});

test('businesses are fully isolated from each other', async () => {
  const hane = (await call('POST', '/api/employees', { name: 'Hane Worker', pin: '1212' })).data;
  const laad = (
    await call('POST', '/api/employees', { name: 'Laad Worker', pin: '3434' }, LAADI_MANAGER)
  ).data;

  // Each manager sees only their own business's employees.
  const haneList = await call('GET', '/api/employees');
  const laadList = await call('GET', '/api/employees', undefined, LAADI_MANAGER);
  assert.ok(haneList.data.some((e) => e.name === 'Hane Worker'));
  assert.ok(!haneList.data.some((e) => e.name === 'Laad Worker'));
  assert.ok(laadList.data.some((e) => e.name === 'Laad Worker'));
  assert.ok(!laadList.data.some((e) => e.name === 'Hane Worker'));

  // A manager cannot reach the other business's employee by id.
  const crossRead = await call('GET', `/api/reports/monthly?employee_id=${laad.id}&month=2026-07`);
  const haneEmployeeIds = haneList.data.map((e) => e.id);
  if (crossRead.status === 200) {
    assert.ok(
      haneEmployeeIds.includes(crossRead.data.employee.id),
      'a manager only ever resolves ids inside their own business'
    );
    assert.notStrictEqual(crossRead.data.employee.name, 'Laad Worker');
  }

  // A worker PIN is only valid for the business it belongs to.
  const wrongBusiness = await call('GET', '/api/employees', undefined, `Bearer worker:laadi:${hane.id}:1212`);
  assert.strictEqual(wrongBusiness.status, 401);

  // The login picker is per business.
  const hanePicker = await call('GET', '/api/login/employees?business=hanechess', undefined, null);
  const laadPicker = await call('GET', '/api/login/employees?business=laadi', undefined, null);
  assert.ok(hanePicker.data.some((e) => e.name === 'Hane Worker'));
  assert.ok(!hanePicker.data.some((e) => e.name === 'Laad Worker'));
  assert.ok(laadPicker.data.some((e) => e.name === 'Laad Worker'));

  const unknownPicker = await call('GET', '/api/login/employees?business=nope', undefined, null);
  assert.strictEqual(unknownPicker.status, 400);
});

test('full report columns and overtime for לעד י', async () => {
  const emp = (
    await call('POST', '/api/employees', { name: 'Overtime Oren' }, LAADI_MANAGER)
  ).data;

  // Wednesday: 11 hours minus a 30 min break = 10:30 net, standard day 08:30.
  await call(
    'POST',
    '/api/entries',
    {
      employee_id: emp.id,
      clock_in: '2026-07-01T05:00:00Z',
      clock_out: '2026-07-01T16:00:00Z',
      break_minutes: 30,
      notes: 'long day',
    },
    LAADI_MANAGER
  );
  // Saturday is a rest day: every hour counts at 200%.
  await call(
    'POST',
    '/api/entries',
    {
      employee_id: emp.id,
      clock_in: '2026-07-04T06:00:00Z',
      clock_out: '2026-07-04T10:00:00Z',
    },
    LAADI_MANAGER
  );

  const report = await call(
    'GET',
    `/api/reports/monthly?employee_id=${emp.id}&month=2026-07`,
    undefined,
    LAADI_MANAGER
  );
  assert.strictEqual(report.status, 200);
  assert.strictEqual(report.data.business.full_report, true, 'לעד י gets the full report');
  assert.strictEqual(report.data.daily_standard_minutes, 510);

  const wed = report.data.days[0];
  assert.strictEqual(wed.net_minutes, 630); // 11:00 - 00:30
  assert.strictEqual(wed.regular_minutes, 510); // capped at the standard day
  assert.strictEqual(wed.ot125_minutes, 120); // first two hours over
  assert.strictEqual(wed.ot150_minutes, 0);
  assert.strictEqual(wed.ot200_minutes, 0);
  assert.strictEqual(wed.break_minutes, 30);
  assert.strictEqual(wed.standard_minutes, 510);
  assert.strictEqual(wed.deficit_minutes, 0);
  assert.strictEqual(wed.notes, 'long day');

  const sat = report.data.days[3];
  assert.strictEqual(sat.weekday, 6);
  assert.strictEqual(sat.ot200_minutes, 240, 'rest-day hours are all 200%');
  assert.strictEqual(sat.regular_minutes, 0);
  assert.strictEqual(sat.standard_minutes, 0, 'no standard is expected on a rest day');
  assert.strictEqual(sat.deficit_minutes, 0);

  assert.strictEqual(report.data.totals.ot125_minutes, 120);
  assert.strictEqual(report.data.totals.ot200_minutes, 240);
  assert.strictEqual(report.data.totals.deficit_minutes, 0);

  // A short day produces a deficit against the standard.
  await call(
    'POST',
    '/api/entries',
    { employee_id: emp.id, clock_in: '2026-07-02T06:00:00Z', clock_out: '2026-07-02T12:00:00Z' },
    LAADI_MANAGER
  );
  const withDeficit = await call(
    'GET',
    `/api/reports/monthly?employee_id=${emp.id}&month=2026-07`,
    undefined,
    LAADI_MANAGER
  );
  const thu = withDeficit.data.days[1];
  assert.strictEqual(thu.net_minutes, 360);
  assert.strictEqual(thu.deficit_minutes, 150); // 08:30 - 06:00

  // הנכס keeps the trimmed report.
  const hane = await call('GET', '/api/reports/monthly?employee_id=1&month=2026-07');
  assert.strictEqual(hane.data.business.full_report, false);
});

test('manager can set the standard working day', async () => {
  const changed = await call('POST', '/api/settings/daily-standard', { minutes: 480 }, LAADI_MANAGER);
  assert.strictEqual(changed.status, 200);

  const settings = await call('GET', '/api/settings', undefined, LAADI_MANAGER);
  assert.strictEqual(settings.data.daily_standard_minutes, 480);
  assert.strictEqual(settings.data.business.id, 'laadi');

  // The other business is unaffected.
  const other = await call('GET', '/api/settings');
  assert.strictEqual(other.data.daily_standard_minutes, 510);

  const bad = await call('POST', '/api/settings/daily-standard', { minutes: 5000 }, LAADI_MANAGER);
  assert.strictEqual(bad.status, 400);

  await call('POST', '/api/settings/daily-standard', { minutes: 510 }, LAADI_MANAGER);
});

test('login employee picker is public, static files served', async () => {
  const picker = await call('GET', '/api/login/employees?business=hanechess', undefined, null);
  assert.strictEqual(picker.status, 200);
  assert.ok(picker.data.length > 0);
  assert.ok(picker.data.every((e) => 'has_pin' in e && !('email' in e)));

  const res = await fetch(base + '/');
  assert.strictEqual(res.status, 200);
  assert.ok((await res.text()).includes('Work Hours'));
});
