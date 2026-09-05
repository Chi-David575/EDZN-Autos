const express = require('express');
const bcrypt = require('bcrypt');
const { rowToCamel, requireAdmin } = require('../src/middleware');

function usersRouter(pool) {
  const router = express.Router();

  function sanitizeUser(row) {
    if (!row) return null;
    const user = rowToCamel(row);
    delete user.passwordHash;
    delete user.otpCode;
    return user;
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
    try {
      const existing = await pool.query('select * from users where phone = $1', [phone]);
      if (existing.rows[0]) {
        return res.status(400).json({ error: 'An account with this phone number already exists. Please log in.' });
      }

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const otpCode = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      const { rows } = await pool.query(
        `insert into users (name, phone, email, password_hash, lat, lng, location_label, otp_code, otp_expires_at, is_verified)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false) returning *`,
        [name, phone, email || null, passwordHash, lat ?? null, lng ?? null, locationLabel || 'Not shared', otpCode, otpExpiresAt]
      );

      console.log(`[OTP for User ${phone}]: ${otpCode}`);
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
      const { rows } = await pool.query('select * from users where phone = $1', [phone]);
      if (!rows[0]) return res.status(404).json({ error: 'User not found.' });

      const user = rows[0];
      if (user.otp_code !== otpCode) {
        return res.status(400).json({ error: 'Invalid OTP code.' });
      }
      if (new Date() > new Date(user.otp_expires_at)) {
        return res.status(400).json({ error: 'OTP code has expired.' });
      }

      const updated = await pool.query(
        'update users set is_verified = true, otp_code = null, otp_expires_at = null where id = $1 returning *',
        [user.id]
      );
      res.json({ message: 'Account successfully verified!', user: sanitizeUser(updated.rows[0]) });
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
      if (!rows[0]) return res.status(404).json({ error: 'User not found.' });

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Incorrect password.' });

      res.json(sanitizeUser(user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  router.get('/by-phone/:phone', async (req, res) => {
    try {
      const { rows } = await pool.query('select * from users where phone = $1', [req.params.phone]);
      if (!rows[0]) return res.status(404).json({ error: 'No profile found for that number.' });
      res.json(sanitizeUser(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Lookup failed' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { rows } = await pool.query('select * from users where id = $1', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(sanitizeUser(rows[0]));
    } catch (err) {
      res.status(500).json({ error: 'Lookup failed' });
    }
  });

  router.patch('/:id/location', async (req, res) => {
    const { lat, lng, locationLabel } = req.body;
    try {
      const { rows } = await pool.query(
        'update users set lat=$1, lng=$2, location_label=$3 where id=$4 returning *',
        [lat, lng, locationLabel || 'GPS location shared', req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(sanitizeUser(rows[0]));
    } catch (err) {
      res.status(500).json({ error: 'Failed to update location' });
    }
  });

  return router;
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { usersRouter };