const express = require('express');
const { rowToCamel } = require('../src/middleware');
const { resolveOrCreateUser } = require('../src/providerRegister');
const { verifyUserOtp } = require('../src/otp');

function dispatchRidersRouter(pool) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const { name, phone, email, password, vehicle, location, photoUrl } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required.' });
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
        role: 'dispatch_rider',
        locationLabel: location || 'Not shared'
      });

      const riderQuery = `
        INSERT INTO dispatch_riders (name, phone, vehicle, location, photo, user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, name, phone, vehicle, location, rating, status, photo, created_at
      `;
      const riderValues = [name, phone, vehicle || null, location || null, photoUrl || null, userId];

      const riderResult = await pool.query(riderQuery, riderValues);
      res.status(201).json({
        message: otpRequired ? 'Dispatch rider registered. Verify with OTP.' : 'Dispatch rider registered.',
        rider: rowToCamel(riderResult.rows[0])
      });
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Dispatch rider registration failed.' });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) return res.status(400).json({ error: 'Phone and OTP are required.' });

    try {
      const result = await verifyUserOtp(pool, phone, otpCode);
      if (result.error) return res.status(result.error.status).json({ error: result.error.message });
      res.json({ message: 'Dispatch rider account verified successfully!' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  return router;
}

module.exports = { dispatchRidersRouter };
