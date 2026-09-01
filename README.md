# Employee Work Hours

A lightweight application for managing employees and tracking their work hours.
Built with plain Node.js (no dependencies), with a vanilla HTML/CSS/JS
single-page frontend. Data is stored in **Supabase Postgres** by default, with a
local SQLite fallback (via the built-in `node:sqlite` module) for offline
development and tests.

## Features

- **Two access levels** – workers sign in with a personal PIN and see only their
  own hours; the manager signs in with the manager PIN and sees and manages
  everything. Enforced server-side on every API request.
- **Employees** – add, edit, deactivate, and delete employees (name, email,
  personal PIN) — manager only.
- **Clock in / out** – one-click clocking from the dashboard, with live "who's in" status.
- **Manual time entries** – add or correct entries with clock-in/out times, break minutes, and notes.
- **Filtering** – browse entries by employee and date range.
- **Reports** – total hours and days worked per employee for any date range
  (with "this week" / "this month" shortcuts) and CSV export.

## Requirements

- Node.js **22.5+** (uses the built-in `node:sqlite` module — no `npm install` needed).

## Running

```bash
npm start
# or: node server.js
```

Then open http://localhost:3000.

## Storage

The storage backend is selected in `config.js`:

- **Supabase Postgres** (default) — used whenever Supabase credentials are
  available. Defaults for the project's URL and publishable key are committed
  in `config.js` (the publishable key is public by design); override them with
  the `SUPABASE_URL` / `SUPABASE_KEY` environment variables. The schema lives
  in the Supabase project's migration history.
- **SQLite** — set `STORAGE=sqlite` to store data locally in `data/workhours.db`
  (override the path with `DB_PATH`). Tests always use this backend with an
  in-memory database.

`PORT` overrides the HTTP port.

## Authentication

- **Workers** sign in by picking their name and entering the personal PIN the
  manager set for them. They can clock in/out, add and edit entries, and see
  reports — for themselves only.
- **The manager** signs in with the manager PIN (default `0000` — change it
  right away from the Employees tab). Managers have full access, including
  employee management and setting worker PINs.
- Credentials are sent as `Authorization: Bearer manager:<pin>` /
  `Bearer worker:<id>:<pin>` and verified against salted PIN hashes on every
  request; PINs are never stored in plain text.

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
| POST | `/api/employees` | Create employee `{name, email?}` |
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

Timestamps are stored in UTC (ISO 8601); dates are `YYYY-MM-DD`.
Hours are computed as `(clock_out − clock_in) − break_minutes`.
