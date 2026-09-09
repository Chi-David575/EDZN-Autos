const express = require('express');
const { rowToCamel } = require('../src/middleware');
const { resolveOrCreateUser } = require('../src/providerRegister');
const { verifyUserOtp } = require('../src/otp');

function mechanicsRouter(pool) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const { name, phone, email, password, location, specialties, carsServiced, priceRange, bio, photoUrl } = req.body;

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
        role: 'mechanic',
        locationLabel: location || 'Not shared'
      });

      const mechanicQuery = `
        INSERT INTO mechanics (name, phone, location, specialties, cars_serviced, price_range, bio, photo, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, user_id, name, phone, location, specialties, cars_serviced, price_range, bio, rating, verified, photo, created_at
      `;
      const mechanicValues = [
        name,
        phone,
        location || null,
        specialties || null,
        carsServiced || null,
        priceRange || null,
        bio || null,
        photoUrl || null,
        userId
      ];

      const mechanicResult = await pool.query(mechanicQuery, mechanicValues);
      res.status(201).json({
        message: otpRequired ? 'Mechanic registered. Please verify via OTP.' : 'Mechanic registered.',
        mechanic: rowToCamel(mechanicResult.rows[0])
      });
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Mechanic registration failed.' });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) return res.status(400).json({ error: 'Phone and OTP are required.' });

    try {
      const result = await verifyUserOtp(pool, phone, otpCode);
      if (result.error) return res.status(result.error.status).json({ error: result.error.message });
      res.json({ message: 'Mechanic account verified successfully!' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  return router;
}

module.exports = { mechanicsRouter };
