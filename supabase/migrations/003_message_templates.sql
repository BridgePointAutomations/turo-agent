create table if not exists message_templates (
  key text primary key,
  body text not null,
  updated_at timestamptz default now()
);
