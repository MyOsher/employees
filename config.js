'use strict';

// The Supabase publishable key is safe to ship in the repo (it is designed to
// be public); override any of these with environment variables if needed.
const supabaseUrl = process.env.SUPABASE_URL || 'https://mumsporfxfzaqxnvjqjh.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_0LEF28i9QofdwYZb_YyrBw_rNy--uCJ';

// STORAGE=sqlite forces the local SQLite backend (used by tests and offline dev).
const storage =
  process.env.STORAGE || (supabaseUrl && supabaseKey ? 'supabase' : 'sqlite');

module.exports = { supabaseUrl, supabaseKey, storage };
