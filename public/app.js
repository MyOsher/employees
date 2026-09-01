'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- i18n ----------

const translations = {
  en: {
    appTitle: 'Work Hours',
    tabDashboard: 'Dashboard',
    tabEmployees: 'Employees',
    tabEntries: 'Time Entries',
    tabReports: 'Reports',
    today: 'Today',
    fullName: 'Full name',
    emailOptional: 'Email (optional)',
    active: 'Active',
    inactive: 'Inactive',
    save: 'Save',
    cancel: 'Cancel',
    thName: 'Name',
    thEmail: 'Email',
    thStatus: 'Status',
    thPin: 'PIN',
    thEmployee: 'Employee',
    thDate: 'Date',
    thIn: 'In',
    thOut: 'Out',
    thBreak: 'Break',
    thHours: 'Hours',
    thNotes: 'Notes',
    thTotalHours: 'Total hours',
    thDays: 'Days',
    thEntries: 'Entries',
    selectEmployee: 'Employee…',
    allEmployees: 'All employees',
    breakMin: 'Break (min)',
    notes: 'Notes',
    filter: 'Filter',
    now: 'Now',
    runReport: 'Run report',
    thisWeek: 'This week',
    thisMonth: 'This month',
    downloadCsv: 'Download CSV',
    total: 'Total',
    clockIn: 'Clock in',
    clockOut: 'Clock out',
    edit: 'Edit',
    del: 'Delete',
    open: 'open',
    clockedInSince: (time) => `Clocked in since ${time}`,
    clockedInMsg: (name) => `${name} clocked in`,
    clockedOutMsg: (name, hours) => `${name} clocked out (${hours} h)`,
    minutes: (n) => `${n} min`,
    noEmployees: 'No active employees yet — add some in the Employees tab.',
    noEntries: 'No entries found.',
    noCompleted: 'No completed entries in this range.',
    pickRange: 'Pick a date range first',
    confirmDeleteEmployee: (name) => `Delete ${name} and all their time entries?`,
    confirmDeleteEntry: 'Delete this time entry?',
    employeeAdded: 'Employee added',
    employeeUpdated: 'Employee updated',
    employeeDeleted: 'Employee deleted',
    entryAdded: 'Entry added',
    entryUpdated: 'Entry updated',
    entryDeleted: 'Entry deleted',
    loginTitle: 'Sign in',
    roleWorker: 'Worker',
    roleManager: 'Manager',
    pinPlaceholder: 'PIN code',
    loginBtn: 'Sign in',
    logout: 'Log out',
    wrongPin: 'Wrong PIN',
    chooseWorker: 'Choose your name…',
    noPinSuffix: '(no PIN — ask the manager)',
    workerPin: 'Worker PIN (4-8 digits)',
    changeManagerPin: 'Change manager PIN',
    promptNewManagerPin: 'New manager PIN (4-8 digits):',
    pinUpdated: 'Manager PIN updated',
    managerLabel: 'Manager',
    pinSet: 'Set',
    pinNotSet: 'Not set',
  },
  he: {
    appTitle: 'שעות עבודה',
    tabDashboard: 'לוח בקרה',
    tabEmployees: 'עובדים',
    tabEntries: 'דיווחי שעות',
    tabReports: 'דוחות',
    today: 'היום',
    fullName: 'שם מלא',
    emailOptional: 'אימייל (אופציונלי)',
    active: 'פעיל',
    inactive: 'לא פעיל',
    save: 'שמירה',
    cancel: 'ביטול',
    thName: 'שם',
    thEmail: 'אימייל',
    thStatus: 'סטטוס',
    thPin: 'קוד',
    thEmployee: 'עובד',
    thDate: 'תאריך',
    thIn: 'כניסה',
    thOut: 'יציאה',
    thBreak: 'הפסקה',
    thHours: 'שעות',
    thNotes: 'הערות',
    thTotalHours: 'סה"כ שעות',
    thDays: 'ימים',
    thEntries: 'דיווחים',
    selectEmployee: 'בחירת עובד…',
    allEmployees: 'כל העובדים',
    breakMin: "הפסקה (דק')",
    notes: 'הערות',
    filter: 'סינון',
    now: 'עכשיו',
    runReport: 'הפקת דוח',
    thisWeek: 'השבוע',
    thisMonth: 'החודש',
    downloadCsv: 'הורדת CSV',
    total: 'סה"כ',
    clockIn: 'כניסה',
    clockOut: 'יציאה',
    edit: 'עריכה',
    del: 'מחיקה',
    open: 'פתוח',
    clockedInSince: (time) => `בעבודה מאז ${time}`,
    clockedInMsg: (name) => `נרשמה כניסה עבור ${name}`,
    clockedOutMsg: (name, hours) => `נרשמה יציאה עבור ${name} (${hours} שעות)`,
    minutes: (n) => `${n} דק'`,
    noEmployees: 'אין עדיין עובדים פעילים — הוסיפו עובדים בלשונית "עובדים".',
    noEntries: 'לא נמצאו דיווחים.',
    noCompleted: 'אין דיווחים שהושלמו בטווח התאריכים הזה.',
    pickRange: 'קודם בחרו טווח תאריכים',
    confirmDeleteEmployee: (name) => `למחוק את ${name} ואת כל דיווחי השעות שלו/ה?`,
    confirmDeleteEntry: 'למחוק את הדיווח הזה?',
    employeeAdded: 'העובד נוסף',
    employeeUpdated: 'פרטי העובד עודכנו',
    employeeDeleted: 'העובד נמחק',
    entryAdded: 'הדיווח נוסף',
    entryUpdated: 'הדיווח עודכן',
    entryDeleted: 'הדיווח נמחק',
    loginTitle: 'כניסה למערכת',
    roleWorker: 'עובד',
    roleManager: 'מנהל',
    pinPlaceholder: 'קוד PIN',
    loginBtn: 'כניסה',
    logout: 'יציאה',
    wrongPin: 'קוד שגוי',
    chooseWorker: 'בחרו את השם שלכם…',
    noPinSuffix: '(אין קוד — פנו למנהל)',
    workerPin: 'קוד PIN לעובד (4-8 ספרות)',
    changeManagerPin: 'שינוי קוד מנהל',
    promptNewManagerPin: 'קוד מנהל חדש (4-8 ספרות):',
    pinUpdated: 'קוד המנהל עודכן',
    managerLabel: 'מנהל',
    pinSet: 'מוגדר',
    pinNotSet: 'לא מוגדר',
  },
};

function initialLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'he') return saved;
  } catch {}
  return (navigator.language || '').toLowerCase().startsWith('he') ? 'he' : 'en';
}

let lang = initialLang();

function t(key, ...args) {
  const value = translations[lang][key] ?? translations.en[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
}

let currentTab = 'dashboard';

function applyLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = t('appTitle');
  $$('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $$('[data-i18n-placeholder]').forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  $('#lang-toggle').textContent = lang === 'he' ? 'English' : 'עברית';
  updateUserLabel();
  if (auth) {
    refresh[currentTab]?.();
  } else {
    renderLoginEmployees();
  }
}

$('#lang-toggle').addEventListener('click', () => {
  lang = lang === 'he' ? 'en' : 'he';
  try {
    localStorage.setItem('lang', lang);
  } catch {}
  applyLanguage();
});

// ---------- auth state ----------

let auth = null;
try {
  const saved = JSON.parse(localStorage.getItem('auth'));
  if (saved && (saved.role === 'manager' || saved.role === 'worker')) auth = saved;
} catch {}

function authHeader() {
  if (!auth) return null;
  return auth.role === 'manager'
    ? `Bearer manager:${auth.pin}`
    : `Bearer worker:${auth.employeeId}:${auth.pin}`;
}

function setAuth(next) {
  auth = next;
  try {
    if (next) localStorage.setItem('auth', JSON.stringify(next));
    else localStorage.removeItem('auth');
  } catch {}
  applyAuthUI();
}

function updateUserLabel() {
  const label = $('#user-label');
  if (!auth) label.textContent = '';
  else label.textContent = auth.role === 'manager' ? t('managerLabel') : auth.name;
}

const isWorker = () => auth && auth.role === 'worker';

function applyAuthUI() {
  const loggedIn = !!auth;
  $('header nav').hidden = !loggedIn;
  $('#logout-btn').hidden = !loggedIn;
  $('#login-screen').hidden = loggedIn;
  updateUserLabel();
  if (!loggedIn) {
    $$('.panel:not(.login-panel)').forEach((p) => (p.hidden = true));
    renderLoginEmployees();
    return;
  }
  // Workers manage only themselves: no Employees tab, no employee pickers.
  $('[data-tab="employees"]').hidden = isWorker();
  $('#entry-form [name="employee_id"]').hidden = isWorker();
  $('#entries-filter-employee').hidden = isWorker();
  currentTab = 'dashboard';
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'dashboard'));
  $$('.panel:not(.login-panel)').forEach((p) => (p.hidden = p.id !== 'tab-dashboard'));
  loadDashboard();
}

// ---------- api ----------

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const header = authHeader();
  if (header) headers.Authorization = header;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401 && auth && !path.startsWith('/api/login')) {
    setAuth(null);
    throw new Error(t('wrongPin'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- login ----------

let loginRole = 'worker';
let loginEmployees = [];

function renderLoginRole() {
  $('#login-role-worker').classList.toggle('active', loginRole === 'worker');
  $('#login-role-manager').classList.toggle('active', loginRole === 'manager');
  $('#login-employee').hidden = loginRole !== 'worker';
}

async function renderLoginEmployees() {
  renderLoginRole();
  const select = $('#login-employee');
  try {
    loginEmployees = await api('/api/login/employees');
  } catch {
    loginEmployees = [];
  }
  const prev = select.value;
  select.replaceChildren(el('option', { value: '' }, t('chooseWorker')));
  for (const emp of loginEmployees) {
    const label = emp.has_pin ? emp.name : `${emp.name} ${t('noPinSuffix')}`;
    select.append(el('option', { value: emp.id, disabled: !emp.has_pin }, label));
  }
  select.value = prev;
}

$('#login-role-worker').onclick = () => {
  loginRole = 'worker';
  renderLoginRole();
};
$('#login-role-manager').onclick = () => {
  loginRole = 'manager';
  renderLoginRole();
};

async function doLogin() {
  const pin = $('#login-pin').value.trim();
  const employeeId = Number($('#login-employee').value);
  if (!pin || (loginRole === 'worker' && !employeeId)) return;
  try {
    const body =
      loginRole === 'manager'
        ? { role: 'manager', pin }
        : { role: 'worker', employee_id: employeeId, pin };
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify(body) });
    $('#login-pin').value = '';
    if (result.role === 'manager') {
      setAuth({ role: 'manager', pin });
    } else {
      setAuth({ role: 'worker', pin, employeeId: result.employee.id, name: result.employee.name });
    }
  } catch (err) {
    toast(err.message === 'Wrong PIN' ? t('wrongPin') : err.message, true);
  }
}

$('#login-submit').onclick = doLogin;
$('#login-pin').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

$('#logout-btn').onclick = () => setAuth(null);

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
    currentTab = btn.dataset.tab;
    $$('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.panel:not(.login-panel)').forEach((p) => (p.hidden = p.id !== `tab-${currentTab}`));
    refresh[currentTab]?.();
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
    container.append(el('p', { className: 'empty' }, t('noEmployees')));
    return;
  }
  for (const emp of employees) {
    if (!emp.active) continue;
    const open = openByEmp.get(emp.id);
    const card = el('div', { className: 'card' });
    card.append(el('div', { className: 'name' }, emp.name));
    if (open) {
      card.append(el('div', { className: 'since' }, t('clockedInSince', fmtTime(open.clock_in))));
      const btn = el('button', { className: 'danger' }, t('clockOut'));
      btn.onclick = async () => {
        try {
          const entry = await api(`/api/employees/${emp.id}/clock-out`, { method: 'POST' });
          toast(t('clockedOutMsg', emp.name, entry.hours));
          loadDashboard();
        } catch (err) {
          toast(err.message, true);
        }
      };
      card.append(btn);
    } else {
      const btn = el('button', { className: 'primary' }, t('clockIn'));
      btn.onclick = async () => {
        try {
          await api(`/api/employees/${emp.id}/clock-in`, { method: 'POST' });
          toast(t('clockedInMsg', emp.name));
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

// ---------- employees (manager only) ----------

const employeeForm = $('#employee-form');

async function loadEmployees() {
  const employees = await api('/api/employees');
  const tbody = $('#employees-table tbody');
  tbody.replaceChildren();
  for (const emp of employees) {
    const tr = el('tr');
    tr.append(
      el('td', {}, emp.name),
      el('td', {}, emp.email || '—'),
      el('td', {}, emp.has_pin ? t('pinSet') : t('pinNotSet'))
    );
    const status = el('td');
    status.append(
      el('span', { className: `badge ${emp.active ? 'on' : 'off'}` }, emp.active ? t('active') : t('inactive'))
    );
    tr.append(status);
    const actions = el('td', { className: 'actions' });
    const edit = el('button', {}, t('edit'));
    edit.onclick = () => {
      employeeForm.id.value = emp.id;
      employeeForm.name.value = emp.name;
      employeeForm.email.value = emp.email || '';
      employeeForm.pin.value = '';
      employeeForm.active.checked = !!emp.active;
      $('#employee-cancel').hidden = false;
      employeeForm.scrollIntoView({ behavior: 'smooth' });
    };
    const del = el('button', { className: 'danger' }, t('del'));
    del.onclick = async () => {
      if (!confirm(t('confirmDeleteEmployee', emp.name))) return;
      try {
        await api(`/api/employees/${emp.id}`, { method: 'DELETE' });
        toast(t('employeeDeleted'));
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
  if (employeeForm.pin.value.trim()) payload.pin = employeeForm.pin.value.trim();
  try {
    await api(id ? `/api/employees/${id}` : '/api/employees', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    toast(id ? t('employeeUpdated') : t('employeeAdded'));
    resetEmployeeForm();
    loadEmployees();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#change-manager-pin').onclick = async () => {
  const newPin = prompt(t('promptNewManagerPin'));
  if (!newPin) return;
  try {
    await api('/api/settings/manager-pin', {
      method: 'POST',
      body: JSON.stringify({ new_pin: newPin.trim() }),
    });
    setAuth({ ...auth, pin: newPin.trim() });
    toast(t('pinUpdated'));
  } catch (err) {
    toast(err.message, true);
  }
};

function fillEmployeeSelects(employees) {
  const formSelect = $('#entry-form [name="employee_id"]');
  const filterSelect = $('#entries-filter-employee');
  const prevForm = formSelect.value;
  const prevFilter = filterSelect.value;
  formSelect.replaceChildren(el('option', { value: '' }, t('selectEmployee')));
  filterSelect.replaceChildren(el('option', { value: '' }, t('allEmployees')));
  for (const emp of employees) {
    formSelect.append(el('option', { value: emp.id }, emp.name));
    filterSelect.append(el('option', { value: emp.id }, emp.name));
  }
  formSelect.value = prevForm;
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
      el('td', {}, entry.clock_out ? fmtTime(entry.clock_out) : t('open')),
      el('td', {}, entry.break_minutes ? t('minutes', entry.break_minutes) : '—'),
      el('td', {}, entry.hours === null ? '—' : entry.hours.toFixed(2)),
      el('td', {}, entry.notes || '')
    );
    const actions = el('td', { className: 'actions' });
    const edit = el('button', {}, t('edit'));
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
    const del = el('button', { className: 'danger' }, t('del'));
    del.onclick = async () => {
      if (!confirm(t('confirmDeleteEntry'))) return;
      try {
        await api(`/api/entries/${entry.id}`, { method: 'DELETE' });
        toast(t('entryDeleted'));
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
    tr.append(el('td', { colSpan: 8, className: 'empty' }, t('noEntries')));
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
    employee_id: isWorker() ? auth.employeeId : Number(entryForm.employee_id.value),
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
    toast(id ? t('entryUpdated') : t('entryAdded'));
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
    toast(t('pickRange'), true);
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
      tr.append(el('td', {}, t('total')), el('td', {}, totalHours.toFixed(2)), el('td', {}, ''), el('td', {}, ''));
      tbody.append(tr);
    } else {
      const tr = el('tr');
      tr.append(el('td', { colSpan: 4, className: 'empty' }, t('noCompleted')));
      tbody.append(tr);
    }
    $('#report-csv').hidden = false;
  } catch (err) {
    toast(err.message, true);
  }
}

// CSV needs the auth header, so fetch it and hand the browser a blob.
$('#report-csv').onclick = async () => {
  const from = $('#report-from').value;
  const to = $('#report-to').value;
  if (!from || !to) return;
  try {
    const res = await fetch(`/api/reports/summary.csv?from=${from}&to=${to}`, {
      headers: { Authorization: authHeader() },
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'work-hours-report.csv' });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast(err.message, true);
  }
};

// ---------- init ----------

const refresh = {
  dashboard: loadDashboard,
  employees: loadEmployees,
  entries: loadEntries,
  reports: () => {},
};

applyLanguage();
applyAuthUI();
