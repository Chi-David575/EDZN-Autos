const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return secret;
}

function signUserToken(user) {
  const secret = getJwtSecret();
  if (!secret) {
    const err = new Error('JWT_SECRET is not configured');
    err.status = 500;
    throw err;
  }
  return jwt.sign(
    { userId: user.id, role: user.role || 'car_owner' },
    secret,
    { expiresIn: '7d' }
  );
}

function authenticateToken(req, res, next) {
  const secret = getJwtSecret();
  if (!secret) {
    return res.status(500).json({ error: 'Server is missing JWT_SECRET.' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

function requireSelfOrAdmin(paramName) {
  return (req, res, next) => {
    const { isAdminRequest } = require('./middleware');
    if (isAdminRequest(req)) return next();
    authenticateToken(req, res, () => {
      const target = req.params[paramName];
      if (!target || String(req.user.userId) !== String(target)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    });
  };
}

module.exports = { authenticateToken, signUserToken, requireSelfOrAdmin };
