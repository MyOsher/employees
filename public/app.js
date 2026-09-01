'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- api ----------

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- toast ----------

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = isError ? 'error' : '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

// ---------- helpers ----------

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- tabs ----------

$$('.tab').forEach((btn) =>
  btn.addEventListener('click', () => {
    $$('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.panel').forEach((p) => (p.hidden = p.id !== `tab-${btn.dataset.tab}`));
    refresh[btn.dataset.tab]?.();
  })
);

// ---------- dashboard ----------

async function loadDashboard() {
  const [employees, openEntries] = await Promise.all([
    api('/api/employees?active=true'),
    api('/api/entries?open=true'),
  ]);
  const openByEmp = new Map(openEntries.map((e) => [e.employee_id, e]));
  const container = $('#dashboard-cards');
  container.replaceChildren();
  if (!employees.length) {
    container.append(el('p', { className: 'empty' }, 'No active employees yet — add some in the Employees tab.'));
    return;
  }
  for (const emp of employees) {
    const open = openByEmp.get(emp.id);
    const card = el('div', { className: 'card' });
    card.append(el('div', { className: 'name' }, emp.name));
    if (open) {
      card.append(el('div', { className: 'since' }, `Clocked in since ${fmtTime(open.clock_in)}`));
      const btn = el('button', { className: 'danger' }, 'Clock out');
      btn.onclick = async () => {
        try {
          const entry = await api(`/api/employees/${emp.id}/clock-out`, { method: 'POST' });
          toast(`${emp.name} clocked out (${entry.hours} h)`);
          loadDashboard();
        } catch (err) {
          toast(err.message, true);
        }
      };
      card.append(btn);
    } else {
      const btn = el('button', { className: 'primary' }, 'Clock in');
      btn.onclick = async () => {
        try {
          await api(`/api/employees/${emp.id}/clock-in`, { method: 'POST' });
          toast(`${emp.name} clocked in`);
          loadDashboard();
        } catch (err) {
          toast(err.message, true);
        }
      };
      card.append(btn);
    }
    container.append(card);
  }
}

// ---------- employees ----------

const employeeForm = $('#employee-form');

async function loadEmployees() {
  const employees = await api('/api/employees');
  const tbody = $('#employees-table tbody');
  tbody.replaceChildren();
  for (const emp of employees) {
    const tr = el('tr');
    tr.append(el('td', {}, emp.name), el('td', {}, emp.email || '—'));
    const status = el('td');
    status.append(el('span', { className: `badge ${emp.active ? 'on' : 'off'}` }, emp.active ? 'Active' : 'Inactive'));
    tr.append(status);
    const actions = el('td', { className: 'actions' });
    const edit = el('button', {}, 'Edit');
    edit.onclick = () => {
      employeeForm.id.value = emp.id;
      employeeForm.name.value = emp.name;
      employeeForm.email.value = emp.email || '';
      employeeForm.active.checked = !!emp.active;
      $('#employee-cancel').hidden = false;
      employeeForm.scrollIntoView({ behavior: 'smooth' });
    };
    const del = el('button', { className: 'danger' }, 'Delete');
    del.onclick = async () => {
      if (!confirm(`Delete ${emp.name} and all their time entries?`)) return;
      try {
        await api(`/api/employees/${emp.id}`, { method: 'DELETE' });
        toast('Employee deleted');
        loadEmployees();
      } catch (err) {
        toast(err.message, true);
      }
    };
    actions.append(edit, del);
    tr.append(actions);
    tbody.append(tr);
  }
  fillEmployeeSelects(employees);
}

function resetEmployeeForm() {
  employeeForm.reset();
  employeeForm.id.value = '';
  employeeForm.active.checked = true;
  $('#employee-cancel').hidden = true;
}

$('#employee-cancel').onclick = resetEmployeeForm;

employeeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = employeeForm.id.value;
  const payload = {
    name: employeeForm.name.value,
    email: employeeForm.email.value || null,
    active: employeeForm.active.checked,
  };
  try {
    await api(id ? `/api/employees/${id}` : '/api/employees', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    toast(id ? 'Employee updated' : 'Employee added');
    resetEmployeeForm();
    loadEmployees();
  } catch (err) {
    toast(err.message, true);
  }
});

function fillEmployeeSelects(employees) {
  const formSelect = $('#entry-form [name="employee_id"]');
  const filterSelect = $('#entries-filter-employee');
  const prevFilter = filterSelect.value;
  formSelect.replaceChildren(el('option', { value: '' }, 'Employee…'));
  filterSelect.replaceChildren(el('option', { value: '' }, 'All employees'));
  for (const emp of employees) {
    formSelect.append(el('option', { value: emp.id }, emp.name));
    filterSelect.append(el('option', { value: emp.id }, emp.name));
  }
  filterSelect.value = prevFilter;
}

// ---------- time entries ----------

const entryForm = $('#entry-form');

async function loadEntries() {
  fillEmployeeSelects(await api('/api/employees'));
  const params = new URLSearchParams();
  const empId = $('#entries-filter-employee').value;
  const from = $('#entries-filter-from').value;
  const to = $('#entries-filter-to').value;
  if (empId) params.set('employee_id', empId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const entries = await api(`/api/entries?${params}`);
  const tbody = $('#entries-table tbody');
  tbody.replaceChildren();
  for (const entry of entries) {
    const tr = el('tr');
    tr.append(
      el('td', {}, entry.employee_name),
      el('td', {}, entry.work_date),
      el('td', {}, fmtTime(entry.clock_in)),
      el('td', {}, entry.clock_out ? fmtTime(entry.clock_out) : 'open'),
      el('td', {}, entry.break_minutes ? `${entry.break_minutes} min` : '—'),
      el('td', {}, entry.hours === null ? '—' : entry.hours.toFixed(2)),
      el('td', {}, entry.notes || '')
    );
    const actions = el('td', { className: 'actions' });
    const edit = el('button', {}, 'Edit');
    edit.onclick = () => {
      entryForm.id.value = entry.id;
      entryForm.employee_id.value = entry.employee_id;
      entryForm.clock_in.value = toLocalInputValue(entry.clock_in);
      entryForm.clock_out.value = toLocalInputValue(entry.clock_out);
      entryForm.break_minutes.value = entry.break_minutes || '';
      entryForm.notes.value = entry.notes || '';
      $('#entry-cancel').hidden = false;
      entryForm.scrollIntoView({ behavior: 'smooth' });
    };
    const del = el('button', { className: 'danger' }, 'Delete');
    del.onclick = async () => {
      if (!confirm('Delete this time entry?')) return;
      try {
        await api(`/api/entries/${entry.id}`, { method: 'DELETE' });
        toast('Entry deleted');
        loadEntries();
      } catch (err) {
        toast(err.message, true);
      }
    };
    actions.append(edit, del);
    tr.append(actions);
    tbody.append(tr);
  }
  if (!entries.length) {
    const tr = el('tr');
    tr.append(el('td', { colSpan: 8, className: 'empty' }, 'No entries found.'));
    tbody.append(tr);
  }
}

function resetEntryForm() {
  entryForm.reset();
  entryForm.id.value = '';
  $('#entry-cancel').hidden = true;
}

$('#entry-cancel').onclick = resetEntryForm;
$('#entries-filter-apply').onclick = loadEntries;

$('#clock-in-now').onclick = () => {
  entryForm.clock_in.value = toLocalInputValue(new Date().toISOString());
};
$('#clock-out-now').onclick = () => {
  entryForm.clock_out.value = toLocalInputValue(new Date().toISOString());
};

entryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = entryForm.id.value;
  const payload = {
    employee_id: Number(entryForm.employee_id.value),
    clock_in: entryForm.clock_in.value ? new Date(entryForm.clock_in.value).toISOString() : null,
    clock_out: entryForm.clock_out.value ? new Date(entryForm.clock_out.value).toISOString() : null,
    break_minutes: Number(entryForm.break_minutes.value) || 0,
    notes: entryForm.notes.value,
  };
  try {
    await api(id ? `/api/entries/${id}` : '/api/entries', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    toast(id ? 'Entry updated' : 'Entry added');
    resetEntryForm();
    loadEntries();
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- reports ----------

function setReportRange(from, to) {
  $('#report-from').value = isoDate(from);
  $('#report-to').value = isoDate(to);
}

$('#report-week').onclick = () => {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  setReportRange(monday, now);
  runReport();
};

$('#report-month').onclick = () => {
  const now = new Date();
  setReportRange(new Date(now.getFullYear(), now.getMonth(), 1), now);
  runReport();
};

$('#report-run').onclick = runReport;

async function runReport() {
  const from = $('#report-from').value;
  const to = $('#report-to').value;
  if (!from || !to) {
    toast('Pick a date range first', true);
    return;
  }
  try {
    const report = await api(`/api/reports/summary?from=${from}&to=${to}`);
    const tbody = $('#report-table tbody');
    tbody.replaceChildren();
    let totalHours = 0;
    for (const r of report) {
      const tr = el('tr');
      tr.append(
        el('td', {}, r.employee_name),
        el('td', {}, r.total_hours.toFixed(2)),
        el('td', {}, String(r.days_worked)),
        el('td', {}, String(r.entries))
      );
      tbody.append(tr);
      totalHours += r.total_hours;
    }
    if (report.length) {
      const tr = el('tr');
      tr.style.fontWeight = '600';
      tr.append(el('td', {}, 'Total'), el('td', {}, totalHours.toFixed(2)), el('td', {}, ''), el('td', {}, ''));
      tbody.append(tr);
    } else {
      const tr = el('tr');
      tr.append(el('td', { colSpan: 4, className: 'empty' }, 'No completed entries in this range.'));
      tbody.append(tr);
    }
    const csv = $('#report-csv');
    csv.href = `/api/reports/summary.csv?from=${from}&to=${to}`;
    csv.hidden = false;
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- init ----------

const refresh = {
  dashboard: loadDashboard,
  employees: loadEmployees,
  entries: loadEntries,
  reports: () => {},
};

loadDashboard();
