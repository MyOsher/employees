'use strict';

const { HttpError } = require('./errors');

// Public employee reads never include the PIN columns.
const EMP_COLS = 'id,name,email,active,created_at,pin_hash';

function publicEmployee(row) {
  if (!row) return null;
  const { pin_hash, ...emp } = row;
  emp.has_pin = pin_hash != null;
  return emp;
}

// PostgREST embeds the joined employee as a nested object; flatten it to the
// employee_name column the SQLite store returns.
function flattenEntry(row, employeesTable) {
  if (!row) return null;
  const { [employeesTable]: employees, ...entry } = row;
  if (employees) entry.employee_name = employees.name;
  return entry;
}

const one = (rows) => (Array.isArray(rows) && rows.length ? rows[0] : null);

function createStore(business) {
  const { supabaseUrl, supabaseKey, tablePrefix } = business;
  const T = {
    employees: `${tablePrefix}employees`,
    entries: `${tablePrefix}time_entries`,
    settings: `${tablePrefix}app_settings`,
  };
  // The join is named after the referenced table.
  const EMBED = `${T.employees}(name)`;

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
        if (message.includes('open_entry_per_employee')) {
          throw new HttpError(409, 'Employee is already clocked in');
        }
        throw new HttpError(409, 'An employee with this email already exists');
      }
      if (data && data.code === '23514') throw new HttpError(400, message);
      throw new HttpError(502, `Database error: ${message}`);
    }
    return data;
  }

  const flat = (row) => flattenEntry(row, T.employees);

  return {
    // --- employees ---

    async listEmployees(activeOnly) {
      let path = `${T.employees}?select=${EMP_COLS}&order=name.asc`;
      if (activeOnly) path += '&active=is.true';
      return (await rest(path)).map(publicEmployee);
    },

    async getEmployee(id) {
      return publicEmployee(one(await rest(`${T.employees}?select=${EMP_COLS}&id=eq.${id}`)));
    },

    async getEmployeeSecret(id) {
      return one(await rest(`${T.employees}?select=id,active,pin_hash,pin_salt&id=eq.${id}`));
    },

    async createEmployee({ name, email = null, pin_hash = null, pin_salt = null }) {
      return publicEmployee(
        one(
          await rest(T.employees, {
            method: 'POST',
            body: { name, email, pin_hash, pin_salt },
            prefer: 'return=representation',
          })
        )
      );
    },

    async updateEmployee(id, { name, email, active, pin_hash, pin_salt }) {
      const body = { name, email, active: !!active };
      if (pin_hash !== undefined) {
        body.pin_hash = pin_hash;
        body.pin_salt = pin_salt;
      }
      return publicEmployee(
        one(
          await rest(`${T.employees}?id=eq.${id}`, {
            method: 'PATCH',
            body,
            prefer: 'return=representation',
          })
        )
      );
    },

    async deleteEmployee(id) {
      await rest(`${T.employees}?id=eq.${id}`, { method: 'DELETE' });
    },

    // --- time entries ---

    async getEntry(id) {
      return flat(one(await rest(`${T.entries}?select=*,${EMBED}&id=eq.${id}`)));
    },

    async getOpenEntry(employeeId) {
      return flat(
        one(await rest(`${T.entries}?select=*,${EMBED}&employee_id=eq.${employeeId}&clock_out=is.null`))
      );
    },

    async listEntries({ employeeId, from, to, open } = {}) {
      let path = `${T.entries}?select=*,${EMBED}&order=work_date.desc,clock_in.desc`;
      if (employeeId) path += `&employee_id=eq.${employeeId}`;
      if (from) path += `&work_date=gte.${from}`;
      if (to) path += `&work_date=lte.${to}`;
      if (open) path += '&clock_out=is.null';
      return (await rest(path)).map(flat);
    },

    async createEntry(fields) {
      const row = one(
        await rest(T.entries, { method: 'POST', body: fields, prefer: 'return=representation' })
      );
      return row ? this.getEntry(row.id) : null;
    },

    async updateEntry(id, { work_date, clock_in, clock_out, break_minutes, notes }) {
      await rest(`${T.entries}?id=eq.${id}`, {
        method: 'PATCH',
        body: { work_date, clock_in, clock_out, break_minutes, notes },
      });
      return this.getEntry(id);
    },

    async deleteEntry(id) {
      await rest(`${T.entries}?id=eq.${id}`, { method: 'DELETE' });
    },

    async completedEntries(from, to) {
      const rows = await rest(
        `${T.entries}?select=*,${EMBED}&work_date=gte.${from}&work_date=lte.${to}&clock_out=not.is.null`
      );
      return rows.map(flat);
    },

    // --- settings ---

    async getSettings() {
      return one(await rest(`${T.settings}?select=*&id=eq.1`));
    },

    async setManagerPin(hash, salt) {
      await rest(`${T.settings}?id=eq.1`, {
        method: 'PATCH',
        body: { manager_pin_hash: hash, manager_pin_salt: salt },
      });
    },

    async setDailyStandard(minutes) {
      await rest(`${T.settings}?id=eq.1`, {
        method: 'PATCH',
        body: { daily_standard_minutes: minutes },
      });
    },
  };
}

module.exports = { createStore };
