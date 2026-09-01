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

// Credentials travel as "Authorization: Bearer manager:<pin>" or
// "Bearer worker:<employee_id>:<pin>" and are verified against the
// database on every request.
function parseAuthHeader(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (manager|worker):(.+)$/);
  if (!match) return null;
  if (match[1] === 'manager') {
    return { role: 'manager', pin: match[2] };
  }
  const parts = match[2].split(':');
  if (parts.length !== 2) return null;
  return { role: 'worker', employeeId: Number(parts[0]), pin: parts[1] };
}

module.exports = { hashPin, makePinHash, pinMatches, validatePinFormat, parseAuthHeader };
