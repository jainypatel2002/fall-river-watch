set search_path = public, extensions;

create table if not exists public.weather_cache (
  key text primary key,
  provider text not null default 'openweather',
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists weather_cache_expires_at_idx on public.weather_cache (expires_at);

alter table public.weather_cache enable row level security;

revoke all on public.weather_cache from anon;
revoke all on public.weather_cache from authenticated;
grant all on public.weather_cache to service_role;

notify pgrst, 'reload schema';
