-- ============================================================
-- Performance migration — indexes, aggregates, full-text search
-- Run in Supabase SQL editor or via `supabase db push`
-- ============================================================

-- Compound indexes for the most common query patterns
-- trips filtered by year range + vehicle (used in YTD queries and per-vehicle history)
create index if not exists trips_start_date_vehicle_id_idx on trips(start_date, vehicle_id);

-- expenses filtered by year range + vehicle (used in YTD expense queries)
create index if not exists expenses_date_vehicle_id_idx on expenses(date, vehicle_id);

-- vehicle_documents expiry lookups (used by context builder every 60s)
create index if not exists vehicle_docs_expiry_date_idx on vehicle_documents(expiry_date)
  where expiry_date is not null;

-- conversation_messages ordered retrieval (used when loading chat history)
create index if not exists conv_messages_conv_id_created_at_idx
  on conversation_messages(conversation_id, created_at asc);

-- ============================================================
-- pg_trgm extension + GIN index for fast fuzzy guest name search
-- ============================================================
create extension if not exists pg_trgm;

create index if not exists guests_name_trgm_idx on guests using gin(name gin_trgm_ops);

-- ============================================================
-- YTD summary view — pre-aggregates revenue and expenses at DB level
-- so context.ts doesn't have to sum over full result sets in JS
-- ============================================================
create or replace view ytd_summary as
select
  extract(year from start_date)::int as year,
  coalesce(sum(net_revenue), 0)      as total_net_revenue,
  coalesce(sum(gross_revenue), 0)    as total_gross_revenue,
  count(*)                           as trip_count
from trips
group by extract(year from start_date);

create or replace view ytd_expenses_summary as
select
  extract(year from date)::int as year,
  coalesce(sum(amount), 0)     as total_expenses,
  count(*)                     as expense_count
from expenses
group by extract(year from date);

-- ============================================================
-- Per-vehicle ROI view — used by the get_vehicle_trip_history tool
-- ============================================================
create or replace view vehicle_ytd_stats as
select
  t.vehicle_id,
  f.make,
  f.model,
  f.year                                              as vehicle_year,
  f.daily_rate,
  f.purchase_price,
  f.financing_monthly,
  extract(year from t.start_date)::int                as year,
  count(*)                                            as trip_count,
  coalesce(sum(t.net_revenue), 0)                     as net_revenue,
  coalesce(sum(t.gross_revenue), 0)                   as gross_revenue,
  coalesce(avg(t.host_rating), 0)                     as avg_host_rating,
  coalesce(sum(t.miles_added), 0)                     as total_miles_added
from trips t
join fleet f on f.id = t.vehicle_id
group by t.vehicle_id, f.make, f.model, f.year, f.daily_rate, f.purchase_price, f.financing_monthly, extract(year from t.start_date);
