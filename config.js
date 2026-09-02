'use strict';

// Each business is an isolated tenant: its own employees, time entries and
// manager PIN. Isolation is by table set today (the free Supabase plan allows
// two active projects), and every store is parameterised by url + key + prefix,
// so moving a business onto its own Supabase project later is a config change:
// point its supabaseUrl/supabaseKey at the new project and clear tablePrefix.
//
// The Supabase publishable key is safe to ship in the repo (it is public by
// design); any field can be overridden with an environment variable.
const DEFAULT_URL = process.env.SUPABASE_URL || 'https://mumsporfxfzaqxnvjqjh.supabase.co';
const DEFAULT_KEY = process.env.SUPABASE_KEY || 'sb_publishable_0LEF28i9QofdwYZb_YyrBw_rNy--uCJ';

const BUSINESSES = [
  {
    id: 'hanechess',
    name: 'הנכס',
    // Trimmed monthly report: day, in/out, total, net, regular hours.
    fullReport: false,
    supabaseUrl: process.env.HANECHESS_SUPABASE_URL || DEFAULT_URL,
    supabaseKey: process.env.HANECHESS_SUPABASE_KEY || DEFAULT_KEY,
    tablePrefix: '',
    sqliteFile: 'hanechess.db',
  },
  {
    id: 'laadi',
    name: 'לעד י',
    // Full payroll report: adds 125% / 150% / 200%, break, standard,
    // deficit and notes columns.
    fullReport: true,
    supabaseUrl: process.env.LAADI_SUPABASE_URL || DEFAULT_URL,
    supabaseKey: process.env.LAADI_SUPABASE_KEY || DEFAULT_KEY,
    tablePrefix: 'laadi_',
    sqliteFile: 'laadi.db',
  },
];

const byId = new Map(BUSINESSES.map((b) => [b.id, b]));

function getBusiness(id) {
  return byId.get(id) || null;
}

// Businesses as the login screen needs them — no credentials.
function publicBusinesses() {
  return BUSINESSES.map(({ id, name, fullReport }) => ({ id, name, full_report: fullReport }));
}

// STORAGE=sqlite forces the local SQLite backend (tests and offline dev).
const storage = process.env.STORAGE || 'supabase';

module.exports = { BUSINESSES, getBusiness, publicBusinesses, storage };
