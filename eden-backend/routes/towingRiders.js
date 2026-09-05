const bcrypt = require('bcrypt');
const express = require('express');

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

    try {
      const existingUser = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
      let userId;
      const otpCode = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
      } else {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const userQuery = `
          INSERT INTO users (name, phone, email, password_hash, role, location_label, otp_code, otp_expires_at, is_verified)
          VALUES ($1, $2, $3, $4, 'towing_rider', $5, $6, $7, false)
          RETURNING id;
        `;
        const userResult = await pool.query(userQuery, [name, phone, email || null, passwordHash, location || 'Not shared', otpCode, otpExpiresAt]);
        userId = userResult.rows[0].id;
      }

      const query = `
        INSERT INTO towing_riders (name, email, password, phone, vehicle, location, photo_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, email, phone, vehicle, location, photo_url AS "photoUrl"
      `;
      const values = [name, email, password, phone, vehicle, location, photoUrl];
      const result = await pool.query(query, values);
      
      console.log(`[OTP for Towing Rider ${phone}]: ${otpCode}`);
      res.status(201).json({ message: 'Towing rider registered. Verify with OTP.', rider: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Email already registered.' });
      }
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) return res.status(400).json({ error: 'Phone and OTP are required.' });

    try {
      const userRes = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
      if (!userRes.rows[0]) return res.status(404).json({ error: 'User not found.' });

      const user = userRes.rows[0];
      if (user.otp_code !== otpCode) return res.status(400).json({ error: 'Invalid OTP.' });
      if (new Date() > new Date(user.otp_expires_at)) return res.status(400).json({ error: 'OTP expired.' });

      await pool.query('UPDATE users SET is_verified = true, otp_code = null, otp_expires_at = null WHERE id = $1', [user.id]);
      res.json({ message: 'Towing rider account verified successfully!' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  return router;
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { towingRidersRouter };