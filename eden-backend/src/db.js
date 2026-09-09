const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[edzn] WARNING: DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const isLocalDb = process.env.DATABASE_URL && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  family: 4,
  ssl: isLocalDb ? false : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
});

pool.on('error', (err) => {
  console.error('[edzn] Unexpected database error', err);
});

module.exports = { pool };
