# Employee Work Hours

A lightweight application for managing employees and tracking their work hours.
Built with plain Node.js (no dependencies), with a vanilla HTML/CSS/JS
single-page frontend. Data is stored in **Supabase Postgres** by default, with a
local SQLite fallback (via the built-in `node:sqlite` module) for offline
development and tests.

## Features

- **Two businesses** – "הנכס" and "לעד י" are fully separate tenants: each has
  its own employees, time entries and manager PIN, and nothing is shared. The
  business is chosen at sign-in and is part of every credential.
- **Two access levels** – workers sign in with a personal PIN and see only their
  own hours; the manager signs in with the manager PIN and sees and manages
  everything in their business. Enforced server-side on every API request.
- **Employees** – add, edit, deactivate, and delete employees (name, email,
  personal PIN) — manager only.
- **Clock in / out** – one-click clocking from the dashboard, with live "who's in" status.
- **Manual time entries** – add or correct entries with clock-in/out times, break minutes, and notes.
- **Filtering** – browse entries by employee and date range.
- **Reports** – total hours and days worked per employee for any date range
  (with "this week" / "this month" shortcuts) and CSV export.
- **Monthly timesheet** – a printable payroll-style "hours split" report, one
  row per calendar day. "הנכס" gets the trimmed layout (day, in/out, total,
  net, regular hours); "לעד י" gets the full layout, which adds 125% / 150% /
  200% overtime, break, standard (תקן), deficit (חוסר) and notes.

## Requirements

- Node.js **22.5+** (uses the built-in `node:sqlite` module — no `npm install` needed).

## Running

```bash
npm start
# or: node server.js
```

Then open http://localhost:3000.

## Businesses and storage

Businesses are declared in `config.js`. Each one carries its own Supabase
URL, key and table prefix, plus a `fullReport` flag that selects the monthly
report layout:

| Business | id | Tables | Monthly report |
| --- | --- | --- | --- |
| הנכס | `hanechess` | `employees`, `time_entries`, `app_settings` | trimmed |
| לעד י | `laadi` | `laadi_employees`, `laadi_time_entries`, `laadi_app_settings` | full |

Today both use the same Supabase project with different table sets, because
the free plan allows two active projects. Because every store is built from
`{supabaseUrl, supabaseKey, tablePrefix}`, moving a business onto its own
Supabase project later is a config change: point its
`LAADI_SUPABASE_URL` / `LAADI_SUPABASE_KEY` at the new project and clear its
`tablePrefix`.

The storage backend itself:

- **Supabase Postgres** (default). The committed publishable key is public by
  design; override per business with `HANECHESS_SUPABASE_URL` /
  `HANECHESS_SUPABASE_KEY` / `LAADI_SUPABASE_URL` / `LAADI_SUPABASE_KEY`, or
  globally with `SUPABASE_URL` / `SUPABASE_KEY`.
- **SQLite** — set `STORAGE=sqlite` to store each business in its own file
  under `data/` (`hanechess.db`, `laadi.db`; override the directory with
  `DB_DIR`). Tests use this backend with in-memory databases.

`PORT` overrides the HTTP port.

## Authentication

- **The business** is picked first; a PIN is only ever valid for the business
  it belongs to.
- **Workers** sign in by picking their name and entering the personal PIN the
  manager set for them. They can clock in/out, add and edit entries, and see
  reports — for themselves only.
- **The manager** signs in with the manager PIN (default `0000` — change it
  right away from the Employees tab). Managers have full access, including
  employee management and setting worker PINs.
- Credentials are sent as `Authorization: Bearer manager:<business>:<pin>` /
  `Bearer worker:<business>:<id>:<pin>` and verified against that business's
  salted PIN hashes on every request; PINs are never stored in plain text.

Note: the app's API enforces these roles, but the Supabase REST endpoint
itself still allows full access with the (public) publishable key. Closing
that requires locking the Supabase policies and moving the server to the
secret service-role key via environment variables.

## Tests

```bash
npm test
```

Runs the API test suite with Node's built-in test runner against an in-memory database.

## Deploying to Vercel

The repo includes a `vercel.json` that runs the whole app as a single
serverless function. With the default Supabase backend, data is fully durable —
nothing is stored on Vercel's ephemeral filesystem.

## API overview

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/employees?active=true` | List employees |
| GET | `/api/businesses` | List businesses for the login screen (public) |
| POST | `/api/employees` | Create employee `{name, email?, pin?}` |
| PUT | `/api/employees/:id` | Update employee (partial) |
| DELETE | `/api/employees/:id` | Delete employee and their entries |
| POST | `/api/employees/:id/clock-in` | Start a work session |
| POST | `/api/employees/:id/clock-out` | End the open session `{break_minutes?, notes?}` |
| GET | `/api/entries?employee_id=&from=&to=&open=` | List time entries (filters optional) |
| POST | `/api/entries` | Create manual entry `{employee_id, clock_in, clock_out?, break_minutes?, notes?}` |
| PUT | `/api/entries/:id` | Update entry (partial) |
| DELETE | `/api/entries/:id` | Delete entry |
| GET | `/api/reports/summary?from=&to=` | Per-employee totals (hours, days, entries) |
| GET | `/api/reports/summary.csv?from=&to=` | Same report as CSV download |
| GET | `/api/reports/monthly?employee_id=&month=YYYY-MM` | Per-day monthly timesheet |
| GET | `/api/settings` | Business info and the standard working day |
| POST | `/api/settings/daily-standard` | Set the standard day `{minutes}` (manager) |

Timestamps are stored in UTC (ISO 8601); dates are `YYYY-MM-DD`.
Hours are computed as `(clock_out − clock_in) − break_minutes`.

In the full monthly report, hours up to the standard day (תקן, default 08:30)
count as regular, the next two hours at 125% and the remainder at 150%;
Saturday is treated as a rest day, where all hours count at 200%. The deficit
(חוסר) is the shortfall against the standard on days that were worked.
