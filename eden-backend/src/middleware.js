const crypto = require('crypto');

function isAdminRequest(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const supplied = req.header('x-admin-password') || '';
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin authentication is not configured.' });
  }
  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }
  next();
}

function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelToSnake(s) {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'otpCode',
  'otp_code',
  'otpExpiresAt',
  'otp_expires_at'
]);

function rowToCamel(row) {
  const out = {};
  for (const k in row) {
    if (SENSITIVE_KEYS.has(k)) continue;
    const camel = snakeToCamel(k);
    if (SENSITIVE_KEYS.has(camel)) continue;
    out[camel] = row[k];
  }
  return out;
}

module.exports = { requireAdmin, isAdminRequest, snakeToCamel, camelToSnake, rowToCamel };
