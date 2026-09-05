const bcrypt = require('bcrypt');
const express = require('express');

function partsSellersRouter(pool) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const { shopName, phone, email, password, shopLocation, houseLocation, categories, photoUrl } = req.body;
    
    if (!shopName || !phone || !password || !houseLocation) {
      return res.status(400).json({ error: 'Shop name, phone, password, and house location are required.' });
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
          VALUES ($1, $2, $3, $4, 'parts_seller', $5, $6, $7, false)
          RETURNING id;
        `;
        const userResult = await pool.query(userQuery, [shopName, phone, email || null, passwordHash, shopLocation || 'Not shared', otpCode, otpExpiresAt]);
        userId = userResult.rows[0].id;
      }

      const sellerQuery = `
        INSERT INTO parts_sellers (shop_name, phone, shop_location, house_location, categories, photo, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      const sellerValues = [shopName, phone, shopLocation || null, houseLocation, categories || null, photoUrl || null, userId];
      
      const sellerResult = await pool.query(sellerQuery, sellerValues);
      console.log(`[OTP for Parts Seller ${phone}]: ${otpCode}`);
      res.status(201).json({ message: 'Parts seller registered. Verify with OTP.', seller: sellerResult.rows[0] });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Parts seller registration failed.' });
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
      res.json({ message: 'Parts seller account verified successfully!' });
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

module.exports = { partsSellersRouter };