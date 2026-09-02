'use strict';

const { storage, getBusiness } = require('./config');
const { HttpError } = require('./errors');

const backend = storage === 'sqlite' ? require('./store-sqlite') : require('./store-supabase');

// One store per business, created on first use and reused afterwards.
const stores = new Map();

function storeFor(businessId) {
  const business = getBusiness(businessId);
  if (!business) throw new HttpError(400, 'Unknown business');
  if (!stores.has(businessId)) stores.set(businessId, backend.createStore(business));
  return stores.get(businessId);
}

module.exports = { storeFor };
