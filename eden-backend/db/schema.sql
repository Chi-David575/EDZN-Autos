-- EDZN Autos database schema (Postgres / Supabase)
-- Run this once against your database before starting the server:
--   psql "$DATABASE_URL" -f db/schema.sql

create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key default ('u_' || encode(gen_random_bytes(6), 'hex')),
  name text not null,
  phone text unique not null,
  email text,
  password_hash text not null,
  role text not null default 'car_owner',
  lat double precision,
  lng double precision,
  location_label text default 'Not shared',
  created_at timestamptz not null default now()
);

create table if not exists mechanics (
  id text primary key default ('m_' || encode(gen_random_bytes(6), 'hex')),
  user_id text references users(id) on delete set null,
  name text not null,
  phone text not null,
  location text,
  specialties text[] default '{}',
  cars_serviced text[] default '{}',
  price_range text,
  bio text,
  rating numeric default 0,
  verified boolean default false,
  photo text,
  created_at timestamptz not null default now()
);

create table if not exists parts_sellers (
  id text primary key default ('ps_' || encode(gen_random_bytes(6), 'hex')),
  user_id text references users(id) on delete set null,
  shop_name text not null,
  phone text not null,
  shop_location text,
  house_location text not null,
  categories text[] default '{}',
  photo text,
  created_at timestamptz not null default now()
);

create table if not exists dispatch_riders (
  id text primary key default ('dr_' || encode(gen_random_bytes(6), 'hex')),
  user_id text references users(id) on delete set null,
  name text not null,
  phone text not null,
  vehicle text,
  location text,
  rating numeric default 0,
  status text default 'available',
  photo text,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS towing_riders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle TEXT,
  location TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

create table if not exists parts (
  id text primary key default ('p_' || encode(gen_random_bytes(6), 'hex')),
  seller_id text references parts_sellers(id) on delete set null,
  name text not null,
  category text not null,
  price integer not null,
  stock integer not null default 0,
  photo text,
  created_at timestamptz not null default now()
);

create table if not exists oil_products (
  id text primary key default ('o_' || encode(gen_random_bytes(6), 'hex')),
  name text not null,
  price integer not null,
  stock integer not null default 0,
  photo text,
  created_at timestamptz not null default now()
);

create table if not exists rentals (
  id text primary key default ('r_' || encode(gen_random_bytes(6), 'hex')),
  car text not null,
  price_per_day integer not null,
  seats integer default 5,
  status text default 'available',
  photo text,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key default ('EDZN-' || upper(encode(gen_random_bytes(5), 'hex'))),
  type text not null,
  user_id text references users(id) on delete set null,
  user_name text,
  details jsonb default '{}',
  amount integer not null default 0,
  status text not null default 'requested',
  payment_status text not null default 'unpaid',
  location jsonb default '{}',
  stages jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Evidence trail: every completed transaction gets a receipt row.
-- This is the record the security/fraud-tracing feature relies on.
create table if not exists receipts (
  id text primary key default ('RCPT-' || upper(encode(gen_random_bytes(5), 'hex'))),
  order_id text references orders(id) on delete cascade,
  user_id text references users(id) on delete set null,
  user_name text,
  amount integer not null default 0,
  type text,
  location jsonb default '{}',
  ts timestamptz not null default now()
);

create table if not exists payments (
  id text primary key default ('PAY-' || upper(encode(gen_random_bytes(5), 'hex'))),
  order_id text references orders(id) on delete cascade,
  reference text unique not null,
  provider text not null default 'paystack',
  status text not null default 'pending',
  amount integer not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

const bcrypt = require('bcrypt');

// In your User Schema/Model (MongoDB / SQL / etc.):
// Add passwordHash: String

// 1. Updated Signup Route
app.post('/api/users/signup', async (req, res) => {
  try {
    const { name, phone, email, password, lat, lng, locationLabel } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required.' });
    }
    
    // Hash the password securely
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Save user to database with passwordHash...
    // const newUser = await User.create({ name, phone, email, passwordHash, lat, lng, locationLabel });
    
    res.json({ id: newUser.id, name: newUser.name, phone: newUser.phone, email: newUser.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. New Login Route
app.post('/api/users/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required.' });
    }

    // Find user by phone
    // const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Compare password hashes
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Incorrect password.' });

    res.json({ id: user.id, name: user.name, phone: user.phone, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

-- 1. Users Table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- 2. Mechanics Table
ALTER TABLE mechanics 
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- 3. Parts Sellers Table
ALTER TABLE parts_sellers 
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- 4. Dispatch Riders Table
ALTER TABLE dispatch_riders 
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- 5. Towing Riders Table
ALTER TABLE towing_riders 
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

-- Track user subscription status
ALTER TABLE users ADD COLUMN subscription_status VARCHAR(20) DEFAULT 'inactive'; -- 'active', 'inactive', 'expired'
ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMP;

-- Track provider balances and commission rates
ALTER TABLE service_providers ADD COLUMN wallet_balance DECIMAL(12, 2) DEFAULT 0.00;
ALTER TABLE service_providers ADD COLUMN commission_rate DECIMAL(4, 2) DEFAULT 10.00; -- e.g., 10% commission

-- Transaction logs for auditing and splits
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    provider_id INT REFERENCES service_providers(id),
    total_amount DECIMAL(12, 2) NOT NULL,
    commission_amount DECIMAL(12, 2) NOT NULL,
    provider_payout DECIMAL(12, 2) NOT NULL,
    payment_gateway_ref VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'success', 'failed', 'escrow'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track user subscription status
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'inactive'; -- 'active', 'inactive', 'expired'
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;

-- If you use a unified service_providers table or track wallets per provider type, 
-- add wallet tracking columns. If your providers are split across tables (mechanics, dispatch_riders, etc.), 
-- make sure to add wallet_balance to those tables or create a centralized table:

CREATE TABLE IF NOT EXISTS service_providers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL, -- 'mechanic', 'towing', 'dispatch', 'parts_seller'
    wallet_balance DECIMAL(12, 2) DEFAULT 0.00,
    commission_rate DECIMAL(4, 2) DEFAULT 10.00, -- default 10% commission
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transaction logs for auditing and splits
CREATE TABLE IF NOT EXISTS commissions (
    id SERIAL PRIMARY KEY,
    provider_id INT,
    total_amount DECIMAL(12, 2) NOT NULL,
    commission_amount DECIMAL(12, 2) NOT NULL,
    provider_payout DECIMAL(12, 2) NOT NULL,
    reference VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_receipts_user on receipts(user_id);
create index if not exists idx_parts_seller on parts(seller_id);
create index if not exists idx_payments_order on payments(order_id);