const bcrypt = require('bcrypt');
const express = require('express');
const { rowToCamel } = require('../src/middleware');
const { resolveOrCreateUser } = require('../src/providerRegister');
const { verifyUserOtp } = require('../src/otp');

function towingRidersRouter(pool) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, name, email, phone, vehicle, location, photo_url AS "photoUrl", created_at FROM towing_riders ORDER BY id DESC'
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/register', async (req, res) => {
    const { name, email, password, phone, vehicle, location, photoUrl } = req.body;
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'Name, email, password, and phone are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
      const { userId, otpRequired } = await resolveOrCreateUser(pool, {
        name,
        phone,
        email,
        password,
        role: 'towing_rider',
        locationLabel: location || 'Not shared'
      });

      const passwordHash = await bcrypt.hash(password, 10);
      const query = `
        INSERT INTO towing_riders (name, email, password, phone, vehicle, location, photo_url, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, name, email, phone, vehicle, location, photo_url AS "photoUrl", user_id
      `;
      const values = [name, email, passwordHash, phone, vehicle, location, photoUrl, userId];
      const result = await pool.query(query, values);

      res.status(201).json({
        message: otpRequired ? 'Towing rider registered. Verify with OTP.' : 'Towing rider registered.',
        rider: rowToCamel(result.rows[0])
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Email already registered.' });
      }
      console.error(err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) return res.status(400).json({ error: 'Phone and OTP are required.' });

    try {
      const result = await verifyUserOtp(pool, phone, otpCode);
      if (result.error) return res.status(result.error.status).json({ error: result.error.message });
      res.json({ message: 'Towing rider account verified successfully!' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  return router;
}

module.exports = { towingRidersRouter };
