const express = require('express');
const bcrypt = require('bcrypt');
const { rowToCamel, requireAdmin } = require('../src/middleware');
const { signUserToken, authenticateToken, requireSelfOrAdmin } = require('../src/auth');
const { generateOTP, logOtp, verifyUserOtp } = require('../src/otp');

const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

function usersRouter(pool) {
  const router = express.Router();

  function sanitizeUser(row) {
    if (!row) return null;
    return rowToCamel(row);
  }

  function withToken(userRow) {
    const user = sanitizeUser(userRow);
    return { ...user, token: signUserToken(userRow) };
  }

  router.get('/', requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query('select * from users order by created_at desc limit 500');
      res.json(rows.map(sanitizeUser));
    } catch (err) {
      res.status(500).json({ error: 'Failed to load users' });
    }
  });

  router.post('/signup', async (req, res) => {
    const { name, phone, email, password, lat, lng, locationLabel } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'name, phone, and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    try {
      const existing = await pool.query('select id from users where phone = $1', [phone]);
      if (existing.rows[0]) {
        return res.status(400).json({ error: 'An account with this phone number already exists. Please log in.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const otpCode = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const { rows } = await pool.query(
        `insert into users (name, phone, email, password_hash, lat, lng, location_label, otp_code, otp_expires_at, is_verified)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false) returning *`,
        [name, phone, email || null, passwordHash, lat ?? null, lng ?? null, locationLabel || 'Not shared', otpCode, otpExpiresAt]
      );

      logOtp(phone, otpCode);
      res.status(201).json({
        message: 'Signup successful. Please verify with the OTP sent.',
        user: sanitizeUser(rows[0])
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Signup failed' });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) {
      return res.status(400).json({ error: 'Phone and OTP code are required.' });
    }
    try {
      const result = await verifyUserOtp(pool, phone, otpCode);
      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.message });
      }
      res.json({ message: 'Account successfully verified!', user: withToken(result.user) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  router.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'phone and password are required' });
    }
    try {
      const { rows } = await pool.query('select * from users where phone = $1', [phone]);
      const user = rows[0];
      const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
      if (!user || !match) {
        return res.status(401).json({ error: 'Invalid phone or password.' });
      }
      if (user.is_verified === false) {
        return res.status(403).json({ error: 'Account is not verified. Complete OTP verification first.' });
      }
      res.json(withToken(user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  router.get('/by-phone/:phone', requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query('select * from users where phone = $1', [req.params.phone]);
      if (!rows[0]) return res.status(404).json({ error: 'No profile found for that number.' });
      res.json(sanitizeUser(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Lookup failed' });
    }
  });

  router.get('/:id', requireSelfOrAdmin('id'), async (req, res) => {
    try {
      const { rows } = await pool.query('select * from users where id = $1', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(sanitizeUser(rows[0]));
    } catch (err) {
      res.status(500).json({ error: 'Lookup failed' });
    }
  });

  router.patch('/:id/location', authenticateToken, async (req, res) => {
    if (String(req.user.userId) !== String(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { lat, lng, locationLabel } = req.body;
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Valid lat and lng are required.' });
    }
    try {
      const { rows } = await pool.query(
        'update users set lat=$1, lng=$2, location_label=$3 where id=$4 returning *',
        [latitude, longitude, locationLabel || 'GPS location shared', req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(sanitizeUser(rows[0]));
    } catch (err) {
      res.status(500).json({ error: 'Failed to update location' });
    }
  });

  return router;
}

module.exports = { usersRouter };
