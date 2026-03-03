create extension if not exists pgcrypto with schema public;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null check (source_type in ('rss', 'html')),
  feed_url text,
  page_url text,
  site_url text,
  enabled boolean not null default true,
  fetch_interval_minutes int not null default 30,
  is_official boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'rss' and feed_url is not null)
    or (source_type = 'html' and page_url is not null)
  )
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources(id) on delete cascade,
  source_name text not null,
  is_official boolean not null default false,
  title text not null,
  canonical_url text not null unique,
  original_url text not null,
  published_at timestamptz,
  summary text,
  image_url text,
  category text not null default 'general' check (category in ('general', 'city', 'traffic', 'crime', 'weather', 'schools', 'community', 'business', 'sports')),
  city text,
  state text,
  created_at timestamptz not null default now(),
  check (summary is null or char_length(summary) <= 400)
);

create table if not exists public.news_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default true,
  items_inserted int not null default 0,
  items_skipped int not null default 0,
  error text
);

create index if not exists news_items_published_at_idx on public.news_items (published_at desc);
create index if not exists news_items_category_idx on public.news_items (category);
create index if not exists news_items_source_id_idx on public.news_items (source_id);
create index if not exists news_items_is_official_idx on public.news_items (is_official);

create index if not exists news_sources_enabled_idx on public.news_sources (enabled);

drop trigger if exists news_sources_touch_updated_at on public.news_sources;
create trigger news_sources_touch_updated_at
before update on public.news_sources
for each row
execute function public.touch_updated_at();

alter table public.news_sources enable row level security;
alter table public.news_items enable row level security;
alter table public.news_ingest_runs enable row level security;

drop policy if exists "news_items_public_read" on public.news_items;
create policy "news_items_public_read"
on public.news_items
for select
to anon, authenticated
using (true);

drop policy if exists "news_sources_authenticated_read" on public.news_sources;
create policy "news_sources_authenticated_read"
on public.news_sources
for select
to authenticated
using (true);

insert into public.news_sources (
  name,
  source_type,
  feed_url,
  page_url,
  site_url,
  is_official,
  enabled,
  fetch_interval_minutes
)
values
  (
    'Fall River Reporter',
    'rss',
    'https://fallriverreporter.com/feed/',
    null,
    'https://fallriverreporter.com/',
    false,
    true,
    30
  ),
  (
    'City of Fall River Press Releases',
    'html',
    null,
    'https://fallriverma.gov/government/mayors_office/press_releases/index.php',
    'https://fallriverma.gov/',
    true,
    true,
    30
  )
on conflict (name)
do update
set
  source_type = excluded.source_type,
  feed_url = excluded.feed_url,
  page_url = excluded.page_url,
  site_url = excluded.site_url,
  is_official = excluded.is_official,
  enabled = excluded.enabled,
  fetch_interval_minutes = excluded.fetch_interval_minutes,
  updated_at = now();
