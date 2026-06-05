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
  start_mileage int,
  end_mileage int,
  receipt_url text,
  actual_payout numeric(10,2),
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

-- TRIP LINE ITEMS
create table if not exists trip_line_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  label text not null,
  amount numeric(10,2) not null,
  type text not null default 'fee' check (type in ('fee','discount','deposit','delivery','other'))
);

-- VEHICLE DOCUMENTS
create table if not exists vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  vehicle_id uuid references fleet(id) on delete cascade not null,
  name text not null,
  document_type text not null default 'other'
    check (document_type in ('insurance','registration','title','inspection','other')),
  storage_path text not null,
  public_url text not null,
  expiry_date date,
  notes text
);

-- CONVERSATIONS (AI chat history)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  title text not null default 'New conversation'
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null
);

-- SCHEMA MIGRATIONS (run these if adding to an existing database)
-- alter table maintenance add column if not exists cost numeric(10,2);
-- alter table trips add constraint if not exists trips_guest_id_fkey foreign key (guest_id) references guests(id) on delete set null;

-- ROI Tracker fields (run once against existing databases)
alter table fleet add column if not exists purchase_price numeric(12,2);
alter table fleet add column if not exists purchase_date date;
alter table fleet add column if not exists financing_monthly numeric(10,2);
alter table fleet add column if not exists financing_months int;
alter table fleet add column if not exists depreciation_annual numeric(10,2);


-- INDEXES
create index if not exists trips_vehicle_id_idx on trips(vehicle_id);
create index if not exists trips_start_date_idx on trips(start_date);
create index if not exists trips_guest_id_idx on trips(guest_id);
create index if not exists expenses_vehicle_id_idx on expenses(vehicle_id);
create index if not exists expenses_date_idx on expenses(date);
create index if not exists maintenance_vehicle_id_idx on maintenance(vehicle_id);
create index if not exists maintenance_status_idx on maintenance(status);
create index if not exists trip_line_items_trip_id_idx on trip_line_items(trip_id);
create index if not exists vehicle_docs_vehicle_id_idx on vehicle_documents(vehicle_id);
create index if not exists conversations_updated_at_idx on conversations(updated_at desc);
create index if not exists conv_messages_conv_id_idx on conversation_messages(conversation_id);

-- SUPABASE STORAGE BUCKETS (run once)
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values
--   ('trip-receipts',    'trip-receipts',    true, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
--   ('expense-receipts', 'expense-receipts', true, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
--   ('vehicle-docs',     'vehicle-docs',     true, 20971520, array['image/jpeg','image/png','image/webp','application/pdf'])
-- on conflict (id) do nothing;

-- SEED: Default maintenance schedule types (run after adding a vehicle via app)
-- These are inserted programmatically per vehicle when a new car is added.

-- VIN LOOKUPS
create table if not exists vin_lookups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  vin text not null,
  year text,
  make text,
  model text,
  trim text,
  purchase_price numeric(12,2),
  mileage int,
  report_markdown text not null,
  notes text
);

create index if not exists vin_lookups_created_at_idx on vin_lookups(created_at desc);
