const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[edzn] WARNING: DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  family: 4, // Forces IPv4 to bypass Render IPv6 routing issues
   // Most managed Postgres providers (Supabase, Render, Railway) require SSL.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('[edzn] Unexpected database error', err);
});

module.exports = { pool };