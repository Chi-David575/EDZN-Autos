// Minimal admin gate: the frontend admin dashboard sends the password entered
// by the user in the `x-admin-password` header. This is intentionally simple —
// before real launch, replace this with proper session-based admin accounts.
function requireAdmin(req, res, next) {
  const supplied = req.header('x-admin-password');
  if (!supplied || supplied !== process.env.ADMIN_PASSWORD) {
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
function rowToCamel(row) {
  const out = {};
  for (const k in row) out[snakeToCamel(k)] = row[k];
  return out;
}

module.exports = { requireAdmin, snakeToCamel, camelToSnake, rowToCamel };
