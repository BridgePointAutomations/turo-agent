-- VIN LOOKUPS — saved pre-purchase analysis reports
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
