create extension if not exists pgcrypto;

create table if not exists app_users (
  id text primary key,
  email text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_settings (
  user_id text primary key references app_users(id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists provider_connections (
  id bigserial primary key,
  user_id text not null references app_users(id) on delete cascade,
  provider text not null check (provider in ('strava', 'garmin')),
  provider_user_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists activities (
  user_id text not null references app_users(id) on delete cascade,
  activity_id text not null,
  source text not null check (source in ('garmin', 'strava')),
  source_activity_id text not null,
  source_url text,
  sport text not null,
  start_time timestamptz not null,
  distance_km numeric,
  duration_seconds integer,
  summary jsonb not null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id),
  unique (user_id, source, source_activity_id)
);

create index if not exists activities_user_start_idx on activities(user_id, start_time desc);
create index if not exists activities_user_dedupe_idx on activities(user_id, dedupe_key);

create table if not exists activity_details (
  user_id text not null references app_users(id) on delete cascade,
  activity_id text not null,
  detail jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id),
  foreign key (user_id, activity_id) references activities(user_id, activity_id) on delete cascade
);

create table if not exists user_stats (
  user_id text primary key references app_users(id) on delete cascade,
  stats jsonb not null,
  calculated_at timestamptz not null default now()
);

create table if not exists sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  provider text not null,
  status text not null default 'queued',
  message text,
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
