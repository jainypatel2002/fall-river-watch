-- Align RPC signature with frontend named arguments.
create extension if not exists postgis with schema public;
set search_path = public, extensions;

drop function if exists public.get_reports_nearby(
  double precision,
  double precision,
  double precision,
  text[],
  boolean,
  integer,
  integer,
  integer
);

drop function if exists public.get_reports_nearby(
  text[],
  double precision,
  double precision,
  integer,
  double precision,
  boolean
);

create or replace function public.get_reports_nearby(
  p_center_lat double precision,
  p_center_lng double precision,
  p_categories text[] default null,
  p_hours integer default 24,
  p_radius_miles double precision default 3,
  p_verified_only boolean default false
)
returns setof public.reports
language sql
stable
set search_path = public, extensions
as $$
  select r.*
  from public.reports r
  where
    -- time window
    r.created_at >= now() - make_interval(hours => p_hours)
    and r.expires_at > now()
    -- verified only toggle
    and (not p_verified_only or r.status = 'verified')
    -- category filter (null/empty means all)
    and (p_categories is null or array_length(p_categories, 1) is null or r.category = any(p_categories))
    -- distance filter: use appropriate location column for privacy
    and st_dwithin(
      case when r.category = 'suspicious_activity' then r.obfuscated_location else r.location end,
      st_setsrid(st_makepoint(p_center_lng, p_center_lat), 4326)::geography,
      (p_radius_miles * 1609.344) -- miles to meters
    )
  order by r.created_at desc;
$$;

grant execute on function public.get_reports_nearby(
  double precision,
  double precision,
  text[],
  integer,
  double precision,
  boolean
) to anon, authenticated;

-- Ensure PostgREST reloads schema after function changes.
notify pgrst, 'reload schema';
