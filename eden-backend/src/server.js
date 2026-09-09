require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { makeCollectionRouter } = require('../routes/collections');
const { usersRouter } = require('../routes/users');
const { ordersRouter } = require('../routes/orders');
const { receiptsRouter } = require('../routes/receipts');
const { aiDoctorRouter } = require('../routes/aiDoctor');
const { paymentsRouter } = require('../routes/payments');
const { mechanicsRouter } = require('../routes/mechanics');
const { partsSellersRouter } = require('../routes/partsSellers');
const { dispatchRidersRouter } = require('../routes/dispatchRiders');
const { towingRidersRouter } = require('../routes/towingRiders');
const { authenticateToken } = require('./auth');

if (!process.env.JWT_SECRET) {
  console.warn('[edzn] WARNING: JWT_SECRET is not set. Authenticated routes will fail until it is configured.');
}

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!allowedOrigins.length) {
        if (process.env.NODE_ENV === 'production') {
          return callback(new Error('CORS is not configured'));
        }
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: false
  })
);

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '200kb' }));

app.post('/api/providers/update-location', authenticateToken, async (req, res) => {
  try {
    const { providerId, latitude, longitude } = req.body;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!providerId || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'providerId, latitude, and longitude are required.' });
    }

    const query = `
      UPDATE service_providers
      SET lat = $1,
          lng = $2,
          last_updated = NOW(),
          is_online = true
      WHERE id = $3 AND user_id = $4
      RETURNING id, is_online, last_updated;
    `;

    const result = await pool.query(query, [lat, lng, providerId, req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error updating provider location:', err);
    res.status(500).json({ error: 'Server error updating location' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'edzn-autos-backend' }));

app.use('/api/users', usersRouter(pool));
app.use('/api/orders', ordersRouter(pool));
app.use('/api/receipts', receiptsRouter(pool));
app.use('/api/ai-doctor', aiDoctorRouter());
app.use('/api/payments', paymentsRouter(pool));
app.use('/api/mechanics', mechanicsRouter(pool));
app.use('/api/parts-sellers', partsSellersRouter(pool));
app.use('/api/dispatch-riders', dispatchRidersRouter(pool));
app.use('/api/towing-riders', towingRidersRouter(pool));

app.use(
  '/api/mechanics',
  makeCollectionRouter(pool, {
    table: 'mechanics',
    fields: [
      { js: 'name', sql: 'name', required: true },
      { js: 'phone', sql: 'phone', required: true },
      { js: 'location', sql: 'location' },
      { js: 'specialties', sql: 'specialties' },
      { js: 'carsServiced', sql: 'cars_serviced' },
      { js: 'priceRange', sql: 'price_range' },
      { js: 'bio', sql: 'bio' },
      { js: 'rating', sql: 'rating' },
      { js: 'verified', sql: 'verified' },
      { js: 'photoUrl', sql: 'photo' },
      { js: 'userId', sql: 'user_id' }
    ]
  })
);

app.use(
  '/api/parts-sellers',
  makeCollectionRouter(pool, {
    table: 'parts_sellers',
    fields: [
      { js: 'shopName', sql: 'shop_name', required: true },
      { js: 'phone', sql: 'phone', required: true },
      { js: 'shopLocation', sql: 'shop_location' },
      { js: 'houseLocation', sql: 'house_location', required: true },
      { js: 'categories', sql: 'categories' },
      { js: 'userId', sql: 'user_id' }
    ]
  })
);

app.use(
  '/api/dispatch-riders',
  makeCollectionRouter(pool, {
    table: 'dispatch_riders',
    fields: [
      { js: 'name', sql: 'name', required: true },
      { js: 'phone', sql: 'phone', required: true },
      { js: 'vehicle', sql: 'vehicle' },
      { js: 'location', sql: 'location' },
      { js: 'rating', sql: 'rating' },
      { js: 'status', sql: 'status' },
      { js: 'photoUrl', sql: 'photo' },
      { js: 'userId', sql: 'user_id' }
    ]
  })
);

app.use(
  '/api/towing-riders',
  makeCollectionRouter(pool, {
    table: 'towing_riders',
    fields: [
      { js: 'name', sql: 'name', required: true },
      { js: 'email', sql: 'email', required: true },
      { js: 'password', sql: 'password', required: true },
      { js: 'phone', sql: 'phone', required: true },
      { js: 'vehicle', sql: 'vehicle' },
      { js: 'location', sql: 'location' },
      { js: 'photoUrl', sql: 'photo_url' },
      { js: 'userId', sql: 'user_id' }
    ]
  })
);

app.use(
  '/api/parts',
  makeCollectionRouter(pool, {
    table: 'parts',
    openCreate: true,
    fields: [
      { js: 'name', sql: 'name', required: true },
      { js: 'category', sql: 'category', required: true },
      { js: 'price', sql: 'price', required: true },
      { js: 'stock', sql: 'stock', required: true },
      { js: 'sellerId', sql: 'seller_id' }
    ]
  })
);

app.use(
  '/api/oil-products',
  makeCollectionRouter(pool, {
    table: 'oil_products',
    fields: [
      { js: 'name', sql: 'name', required: true },
      { js: 'price', sql: 'price', required: true },
      { js: 'stock', sql: 'stock', required: true }
    ]
  })
);

app.use(
  '/api/rentals',
  makeCollectionRouter(pool, {
    table: 'rentals',
    fields: [
      { js: 'car', sql: 'car', required: true },
      { js: 'pricePerDay', sql: 'price_per_day', required: true },
      { js: 'seats', sql: 'seats' },
      { js: 'status', sql: 'status' }
    ]
  })
);

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the EDZN Autos API',
    status: 'online',
    documentation: '/health'
  });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`[edzn] backend listening on port ${PORT}`));
