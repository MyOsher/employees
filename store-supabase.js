'use strict';

const { HttpError } = require('./errors');
const { supabaseUrl, supabaseKey } = require('./config');

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && data.message) || `HTTP ${res.status}`;
    if (data && data.code === '23505') {
      if (message.includes('uniq_open_entry_per_employee')) {
        throw new HttpError(409, 'Employee is already clocked in');
      }
      throw new HttpError(409, 'An employee with this email already exists');
    }
    if (data && data.code === '23514') {
      throw new HttpError(400, message);
    }
    throw new HttpError(502, `Database error: ${message}`);
  }
  return data;
}

const one = (rows) => (Array.isArray(rows) && rows.length ? rows[0] : null);

// PostgREST embeds the joined employee as a nested object; flatten it to the
// employee_name column the SQLite store returns.
function flattenEntry(row) {
  if (!row) return null;
  const { employees, ...entry } = row;
  if (employees) entry.employee_name = employees.name;
  return entry;
}

// --- employees ---

async function listEmployees(activeOnly) {
  let path = 'employees?select=*&order=name.asc';
  if (activeOnly) path += '&active=is.true';
  return rest(path);
}

async function getEmployee(id) {
  return one(await rest(`employees?select=*&id=eq.${id}`));
}

async function createEmployee(fields) {
  return one(await rest('employees', { method: 'POST', body: fields, prefer: 'return=representation' }));
}

async function updateEmployee(id, { name, email, active }) {
  return one(
    await rest(`employees?id=eq.${id}`, {
      method: 'PATCH',
      body: { name, email, active: !!active },
      prefer: 'return=representation',
    })
  );
}

async function deleteEmployee(id) {
  await rest(`employees?id=eq.${id}`, { method: 'DELETE' });
}

// --- time entries ---

async function getEntry(id) {
  return flattenEntry(one(await rest(`time_entries?select=*,employees(name)&id=eq.${id}`)));
}

async function getOpenEntry(employeeId) {
  return flattenEntry(
    one(await rest(`time_entries?select=*,employees(name)&employee_id=eq.${employeeId}&clock_out=is.null`))
  );
}

async function listEntries({ employeeId, from, to, open } = {}) {
  let path = 'time_entries?select=*,employees(name)&order=work_date.desc,clock_in.desc';
  if (employeeId) path += `&employee_id=eq.${employeeId}`;
  if (from) path += `&work_date=gte.${from}`;
  if (to) path += `&work_date=lte.${to}`;
  if (open) path += '&clock_out=is.null';
  return (await rest(path)).map(flattenEntry);
}

async function createEntry(fields) {
  const row = one(
    await rest('time_entries', { method: 'POST', body: fields, prefer: 'return=representation' })
  );
  return row ? getEntry(row.id) : null;
}

async function updateEntry(id, { work_date, clock_in, clock_out, break_minutes, notes }) {
  await rest(`time_entries?id=eq.${id}`, {
    method: 'PATCH',
    body: { work_date, clock_in, clock_out, break_minutes, notes },
  });
  return getEntry(id);
}

async function deleteEntry(id) {
  await rest(`time_entries?id=eq.${id}`, { method: 'DELETE' });
}

async function completedEntries(from, to) {
  const rows = await rest(
    `time_entries?select=*,employees(name)&work_date=gte.${from}&work_date=lte.${to}&clock_out=not.is.null`
  );
  return rows.map(flattenEntry);
}

module.exports = {
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
};
