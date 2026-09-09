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
  otp_code text,
  otp_expires_at timestamptz,
  is_verified boolean default false,
  subscription_status varchar(20) default 'inactive',
  subscription_expires_at timestamptz,
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

create table if not exists towing_riders (
  id serial primary key,
  user_id text references users(id) on delete set null,
  name text not null,
  email text unique not null,
  password text not null,
  phone text not null,
  vehicle text,
  location text,
  photo_url text,
  otp_code text,
  otp_expires_at timestamptz,
  is_verified boolean default false,
  created_at timestamp default current_timestamp
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

create table if not exists service_providers (
  id serial primary key,
  user_id text references users(id) on delete set null,
  name text not null,
  role text not null,
  wallet_balance decimal(12, 2) default 0.00,
  commission_rate decimal(4, 2) default 10.00,
  lat double precision,
  lng double precision,
  last_updated timestamptz,
  is_online boolean default false,
  created_at timestamp default current_timestamp
);

create table if not exists commissions (
  id serial primary key,
  provider_id int,
  total_amount decimal(12, 2) not null,
  commission_amount decimal(12, 2) not null,
  provider_payout decimal(12, 2) not null,
  reference varchar(255) unique not null,
  created_at timestamp default current_timestamp
);

-- Columns for databases created from an older schema.sql
alter table users add column if not exists otp_code text;
alter table users add column if not exists otp_expires_at timestamptz;
alter table users add column if not exists is_verified boolean default false;
alter table users add column if not exists subscription_status varchar(20) default 'inactive';
alter table users add column if not exists subscription_expires_at timestamptz;

alter table towing_riders add column if not exists user_id text references users(id) on delete set null;
alter table towing_riders add column if not exists otp_code text;
alter table towing_riders add column if not exists otp_expires_at timestamptz;
alter table towing_riders add column if not exists is_verified boolean default false;

alter table service_providers add column if not exists user_id text;
alter table service_providers add column if not exists wallet_balance decimal(12, 2) default 0.00;
alter table service_providers add column if not exists commission_rate decimal(4, 2) default 10.00;
alter table service_providers add column if not exists lat double precision;
alter table service_providers add column if not exists lng double precision;
alter table service_providers add column if not exists last_updated timestamptz;
alter table service_providers add column if not exists is_online boolean default false;

create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_receipts_user on receipts(user_id);
create index if not exists idx_parts_seller on parts(seller_id);
create index if not exists idx_payments_order on payments(order_id);
create index if not exists idx_service_providers_user on service_providers(user_id);
