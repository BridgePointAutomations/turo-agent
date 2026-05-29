-- ============================================================
-- TuroAgent — Supabase Schema
-- Run this entire file in your Supabase SQL editor
-- ============================================================

-- FLEET
create table if not exists fleet (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  make text not null,
  model text not null,
  year int not null,
  color text,
  license_plate text,
  vin text,
  daily_rate numeric(8,2) not null default 0,
  current_mileage int default 0,
  status text not null default 'active' check (status in ('active','inactive','maintenance')),
  turo_listing_id text,
  notes text
);

-- TRIPS
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  vehicle_id uuid references fleet(id) on delete cascade,
  guest_name text not null,
  guest_id uuid,
  start_date date not null,
  end_date date not null,
  daily_rate numeric(8,2) not null,
  gross_revenue numeric(10,2) not null,
  turo_fee_pct numeric(5,2) not null default 25,
  net_revenue numeric(10,2) generated always as (gross_revenue * (1 - turo_fee_pct / 100)) stored,
  guest_rating int check (guest_rating between 1 and 5),
  host_rating numeric(3,1) check (host_rating between 1 and 5),
  miles_added int default 0,
  notes text,
  status text not null default 'completed' check (status in ('upcoming','active','completed','cancelled'))
);

-- EXPENSES
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  vehicle_id uuid references fleet(id) on delete cascade,
  date date not null default current_date,
  category text not null check (category in ('maintenance','insurance','fuel','cleaning','registration','parking','other')),
  description text not null,
  amount numeric(10,2) not null,
  mileage_at_service int,
  receipt_url text,
  notes text
);

-- GUESTS
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  turo_profile_url text,
  total_trips int default 0,
  avg_rating numeric(3,1),
  flag text default 'none' check (flag in ('none','great','caution','blocked')),
  notes text,
  last_trip_date date
);

-- MAINTENANCE SCHEDULE
create table if not exists maintenance (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  vehicle_id uuid references fleet(id) on delete cascade,
  service_type text not null,
  last_service_date date,
  last_service_mileage int,
  interval_miles int,
  interval_days int,
  next_due_date date,
  next_due_mileage int,
  status text not null default 'ok' check (status in ('ok','due_soon','overdue','completed')),
  notes text
);

-- INDEXES
create index if not exists trips_vehicle_id_idx on trips(vehicle_id);
create index if not exists trips_start_date_idx on trips(start_date);
create index if not exists expenses_vehicle_id_idx on expenses(vehicle_id);
create index if not exists expenses_date_idx on expenses(date);
create index if not exists maintenance_vehicle_id_idx on maintenance(vehicle_id);
create index if not exists maintenance_status_idx on maintenance(status);

-- SEED: Default maintenance schedule types (run after adding a vehicle via app)
-- These are inserted programmatically per vehicle when a new car is added.
