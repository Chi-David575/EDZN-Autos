const bcrypt = require('bcrypt');
const express = require('express');

function dispatchRidersRouter(pool) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const { name, phone, email, password, vehicle, location, photoUrl } = req.body;
    
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required.' });
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
          VALUES ($1, $2, $3, $4, 'dispatch_rider', $5, $6, $7, false)
          RETURNING id;
        `;
        const userResult = await pool.query(userQuery, [name, phone, email || null, passwordHash, location || 'Not shared', otpCode, otpExpiresAt]);
        userId = userResult.rows[0].id;
      }

      const riderQuery = `
        INSERT INTO dispatch_riders (name, phone, vehicle, location, photo, user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      const riderValues = [name, phone, vehicle || null, location || null, photoUrl || null, userId];
      
      const riderResult = await pool.query(riderQuery, riderValues);
      console.log(`[OTP for Dispatch Rider ${phone}]: ${otpCode}`);
      res.status(201).json({ message: 'Dispatch rider registered. Verify with OTP.', rider: riderResult.rows[0] });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Dispatch rider registration failed.' });
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
      res.json({ message: 'Dispatch rider account verified successfully!' });
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

module.exports = { dispatchRidersRouter };