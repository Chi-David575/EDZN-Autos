require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { makeCollectionRouter } = require('../routes/collections');
const {usersRouter}= require('../routes/users');
const {ordersRouter} = require('../routes/orders');
const {receiptsRouter} = require('../routes/receipts');
const {aiDoctorRouter} = require('../routes/aiDoctor');
const {paymentsRouter} = require('../routes/payments');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: false
  })
);

// The Paystack webhook needs the RAW request body to verify the signature,
// so it must be mounted with express.raw() *before* the global express.json()
// middleware below (which would otherwise consume/parse the body first).
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, service: 'edzn-autos-backend' }));

app.use('/api/users', usersRouter(pool));
app.use('/api/orders', ordersRouter(pool));
app.use('/api/receipts', receiptsRouter(pool));
app.use('/api/ai-doctor', aiDoctorRouter());
app.use('/api/payments', paymentsRouter(pool));

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
      { js: 'userId', sql: 'user_id' }
    ]
  })
);

app.use(
  '/api/parts',
  makeCollectionRouter(pool, {
    table: 'parts',
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

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`[edzn] backend listening on port ${PORT}`));