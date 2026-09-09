const express = require('express');
const { rowToCamel } = require('../src/middleware');
const { resolveOrCreateUser } = require('../src/providerRegister');
const { verifyUserOtp } = require('../src/otp');

function partsSellersRouter(pool) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const { shopName, phone, email, password, shopLocation, houseLocation, categories, photoUrl } = req.body;

    if (!shopName || !phone || !password || !houseLocation) {
      return res.status(400).json({ error: 'Shop name, phone, password, and house location are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
      const { userId, otpRequired } = await resolveOrCreateUser(pool, {
        name: shopName,
        phone,
        email,
        password,
        role: 'parts_seller',
        locationLabel: shopLocation || 'Not shared'
      });

      const sellerQuery = `
        INSERT INTO parts_sellers (shop_name, phone, shop_location, house_location, categories, photo, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, user_id, shop_name, phone, shop_location, house_location, categories, photo, created_at
      `;
      const sellerValues = [shopName, phone, shopLocation || null, houseLocation, categories || null, photoUrl || null, userId];

      const sellerResult = await pool.query(sellerQuery, sellerValues);
      res.status(201).json({
        message: otpRequired ? 'Parts seller registered. Verify with OTP.' : 'Parts seller registered.',
        seller: rowToCamel(sellerResult.rows[0])
      });
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Parts seller registration failed.' });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) return res.status(400).json({ error: 'Phone and OTP are required.' });

    try {
      const result = await verifyUserOtp(pool, phone, otpCode);
      if (result.error) return res.status(result.error.status).json({ error: result.error.message });
      res.json({ message: 'Parts seller account verified successfully!' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  return router;
}

module.exports = { partsSellersRouter };
