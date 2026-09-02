'use strict';

const crypto = require('node:crypto');
const { HttpError } = require('./errors');

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(salt + pin).digest('hex');
}

function makePinHash(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { hash: hashPin(pin, salt), salt };
}

function pinMatches(pin, hash, salt) {
  if (!hash || !salt) return false;
  const candidate = Buffer.from(hashPin(pin, salt));
  const stored = Buffer.from(hash);
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

const PIN_RE = /^\d{4,8}$/;

function validatePinFormat(pin) {
  if (!PIN_RE.test(String(pin))) {
    throw new HttpError(400, 'PIN must be 4-8 digits');
  }
}

// Credentials travel as "Authorization: Bearer manager:<business>:<pin>" or
// "Bearer worker:<business>:<employee_id>:<pin>" and are verified against that
// business's database on every request. The business is part of the credential,
// so a PIN is only ever valid for the business it belongs to.
function parseAuthHeader(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (manager|worker):([a-z0-9_-]+):(.+)$/i);
  if (!match) return null;
  const [, role, businessId, rest] = match;
  if (role === 'manager') return { role: 'manager', businessId, pin: rest };
  const sep = rest.indexOf(':');
  if (sep < 1) return null;
  return {
    role: 'worker',
    businessId,
    employeeId: Number(rest.slice(0, sep)),
    pin: rest.slice(sep + 1),
  };
}

module.exports = { hashPin, makePinHash, pinMatches, validatePinFormat, parseAuthHeader };
