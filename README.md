# Employee Work Hours

A lightweight application for managing employees and tracking their work hours.
Built with plain Node.js (no dependencies), with a vanilla HTML/CSS/JS
single-page frontend. Data is stored in **Supabase Postgres** by default, with a
local SQLite fallback (via the built-in `node:sqlite` module) for offline
development and tests.

## Features

- **Employees** – add, edit, deactivate, and delete employees (name, email, role, hourly rate).
- **Clock in / out** – one-click clocking from the dashboard, with live "who's in" status.
- **Manual time entries** – add or correct entries with clock-in/out times, break minutes, and notes.
- **Filtering** – browse entries by employee and date range.
- **Reports** – total hours, days worked, and pay per employee for any date range
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

Note: the app has no login layer, so the API — and therefore the data — is
writable by anyone who can reach the deployed URL. The Supabase policies
mirror that same trust level.

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
| POST | `/api/employees` | Create employee `{name, email?, role?, hourly_rate?}` |
| PUT | `/api/employees/:id` | Update employee (partial) |
| DELETE | `/api/employees/:id` | Delete employee and their entries |
| POST | `/api/employees/:id/clock-in` | Start a work session |
| POST | `/api/employees/:id/clock-out` | End the open session `{break_minutes?, notes?}` |
| GET | `/api/entries?employee_id=&from=&to=&open=` | List time entries (filters optional) |
| POST | `/api/entries` | Create manual entry `{employee_id, clock_in, clock_out?, break_minutes?, notes?}` |
| PUT | `/api/entries/:id` | Update entry (partial) |
| DELETE | `/api/entries/:id` | Delete entry |
| GET | `/api/reports/summary?from=&to=` | Per-employee totals (hours, days, pay) |
| GET | `/api/reports/summary.csv?from=&to=` | Same report as CSV download |

Timestamps are stored in UTC (ISO 8601); dates are `YYYY-MM-DD`.
Hours are computed as `(clock_out − clock_in) − break_minutes`.
