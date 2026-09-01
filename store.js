'use strict';

const { storage } = require('./config');

module.exports = storage === 'supabase' ? require('./store-supabase') : require('./store-sqlite');
