-- Extensions
create extension if not exists postgis with schema public;
create extension if not exists pgcrypto with schema public;

-- Ensure PostGIS symbols resolve if the extension was previously installed in `extensions`.
set search_path = public, extensions;

-- Enums via CHECK constraints as requested

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  trust_score int not null default 0,
  role text not null default 'user' check (role in ('user', 'mod', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('road_hazard', 'traffic_closure', 'outage', 'weather_hazard', 'lost_pet', 'suspicious_activity')),
  title text,
  description text not null,
  severity int not null check (severity between 1 and 5),
  status text not null default 'unverified' check (status in ('unverified', 'verified', 'disputed', 'resolved', 'expired')),
  location geography(Point, 4326) not null,
  obfuscated_location geography(Point, 4326) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  media_type text not null default 'image' check (media_type in ('image')),
  created_at timestamptz not null default now()
);

create table if not exists public.report_votes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  vote_type text not null check (vote_type in ('confirm', 'dispute')),
  created_at timestamptz not null default now(),
  unique (report_id, voter_id)
);

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('report', 'comment', 'user')),
  target_id uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  channels text[] not null default array['email']::text[],
  radius_miles numeric(4,1) not null default 3.0,
  categories text[] not null default array['road_hazard', 'traffic_closure', 'outage', 'weather_hazard', 'lost_pet', 'suspicious_activity']::text[],
  quiet_hours jsonb not null default jsonb_build_object('start', '22:00', 'end', '07:00'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists reports_location_gix on public.reports using gist (location);
create index if not exists reports_obfuscated_location_gix on public.reports using gist (obfuscated_location);
create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_category_idx on public.reports (category);
create index if not exists reports_expires_at_idx on public.reports (expires_at);
create index if not exists report_votes_report_id_idx on public.report_votes (report_id);
create index if not exists report_votes_voter_id_idx on public.report_votes (voter_id);

-- Auth/user bootstrap
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

-- Helpers for policies
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_role() to anon, authenticated;

-- Deterministic location obfuscation (~300m)
create or replace function public.snap_point_300m(input_geog geography(Point, 4326))
returns geography(Point, 4326)
language plpgsql
immutable
as $$
declare
  lon double precision;
  lat double precision;
  lat_step double precision := 300.0 / 111320.0;
  lon_step double precision;
  snapped_lat double precision;
  snapped_lon double precision;
begin
  lon := st_x(input_geog::geometry);
  lat := st_y(input_geog::geometry);
  lon_step := 300.0 / (111320.0 * greatest(cos(radians(lat)), 0.2));
  snapped_lat := round(lat / lat_step) * lat_step;
  snapped_lon := round(lon / lon_step) * lon_step;

  return st_setsrid(st_makepoint(snapped_lon, snapped_lat), 4326)::geography;
end;
$$;

create or replace function public.set_obfuscated_location()
returns trigger
language plpgsql
as $$
begin
  new.obfuscated_location := public.snap_point_300m(new.location);
  return new;
end;
$$;

drop trigger if exists reports_obfuscation_trigger on public.reports;
create trigger reports_obfuscation_trigger
before insert or update of location on public.reports
for each row
execute function public.set_obfuscated_location();

-- Update report status from votes
create or replace function public.recompute_report_status(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  confirm_count int := 0;
  dispute_count int := 0;
  current_status text;
  is_expired boolean := false;
begin
  select status, expires_at < now()
  into current_status, is_expired
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    return;
  end if;

  if current_status = 'resolved' then
    return;
  end if;

  select
    count(*) filter (where vote_type = 'confirm'),
    count(*) filter (where vote_type = 'dispute')
  into confirm_count, dispute_count
  from public.report_votes
  where report_id = p_report_id;

  if dispute_count >= 3 then
    update public.reports set status = 'disputed' where id = p_report_id;
  elsif confirm_count >= 3 and dispute_count < 3 then
    update public.reports set status = 'verified' where id = p_report_id;
  elsif is_expired and current_status <> 'verified' then
    update public.reports set status = 'expired' where id = p_report_id;
  else
    update public.reports set status = 'unverified' where id = p_report_id;
  end if;
end;
$$;

create or replace function public.on_report_vote_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_report_status(coalesce(new.report_id, old.report_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists report_votes_status_trigger on public.report_votes;
create trigger report_votes_status_trigger
after insert or update or delete on public.report_votes
for each row
execute function public.on_report_vote_change();

-- Lazy expiration helper (called by API reads/writes)
create or replace function public.expire_reports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer := 0;
begin
  update public.reports
  set status = 'expired'
  where expires_at < now()
    and status in ('unverified', 'disputed');

  get diagnostics touched = row_count;
  return touched;
end;
$$;

grant execute on function public.expire_reports() to anon, authenticated;

-- Nearby query RPC for efficient map/feed loading by radius
create or replace function public.get_reports_nearby(
  p_center_lat double precision,
  p_center_lng double precision,
  p_radius_miles double precision,
  p_categories text[],
  p_verified_only boolean,
  p_hours integer,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  id uuid,
  reporter_id uuid,
  category text,
  title text,
  description text,
  severity int,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  display_lat double precision,
  display_lng double precision,
  distance_meters double precision,
  confirms int,
  disputes int,
  media jsonb
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with base as (
    select
      r.*,
      case
        when r.category = 'suspicious_activity' then r.obfuscated_location
        else r.location
      end as display_location
    from public.reports r
    where st_dwithin(
      case
        when r.category = 'suspicious_activity' then r.obfuscated_location
        else r.location
      end,
      st_setsrid(st_makepoint(p_center_lng, p_center_lat), 4326)::geography,
      p_radius_miles * 1609.344
    )
    and r.created_at >= (now() - make_interval(hours => greatest(p_hours, 1)))
    and (coalesce(array_length(p_categories, 1), 0) = 0 or r.category = any(p_categories))
    and (not p_verified_only or r.status = 'verified')
  )
  select
    b.id,
    b.reporter_id,
    b.category,
    b.title,
    b.description,
    b.severity,
    b.status,
    b.created_at,
    b.expires_at,
    st_y(b.display_location::geometry) as display_lat,
    st_x(b.display_location::geometry) as display_lng,
    st_distance(
      b.display_location,
      st_setsrid(st_makepoint(p_center_lng, p_center_lat), 4326)::geography
    ) as distance_meters,
    coalesce(v.confirms, 0)::int as confirms,
    coalesce(v.disputes, 0)::int as disputes,
    coalesce(m.media, '[]'::jsonb) as media
  from base b
  left join lateral (
    select
      count(*) filter (where vote_type = 'confirm') as confirms,
      count(*) filter (where vote_type = 'dispute') as disputes
    from public.report_votes rv
    where rv.report_id = b.id
  ) v on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', rm.id,
        'storage_path', rm.storage_path,
        'media_type', rm.media_type
      )
      order by rm.created_at asc
    ) as media
    from public.report_media rm
    where rm.report_id = b.id
  ) m on true
  order by b.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_reports_nearby(double precision, double precision, double precision, text[], boolean, integer, integer, integer) to anon, authenticated;

create or replace function public.get_report_detail(p_report_id uuid)
returns table (
  id uuid,
  reporter_id uuid,
  category text,
  title text,
  description text,
  severity int,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  display_lat double precision,
  display_lng double precision,
  distance_meters double precision,
  confirms int,
  disputes int,
  media jsonb,
  user_vote text,
  is_owner boolean,
  can_resolve boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with report_base as (
    select
      r.*,
      case
        when r.category = 'suspicious_activity' then r.obfuscated_location
        else r.location
      end as display_location
    from public.reports r
    where r.id = p_report_id
  )
  select
    rb.id,
    rb.reporter_id,
    rb.category,
    rb.title,
    rb.description,
    rb.severity,
    rb.status,
    rb.created_at,
    rb.expires_at,
    st_y(rb.display_location::geometry) as display_lat,
    st_x(rb.display_location::geometry) as display_lng,
    null::double precision as distance_meters,
    coalesce(v.confirms, 0)::int as confirms,
    coalesce(v.disputes, 0)::int as disputes,
    coalesce(m.media, '[]'::jsonb) as media,
    uv.vote_type as user_vote,
    (rb.reporter_id = auth.uid()) as is_owner,
    (rb.reporter_id = auth.uid() or public.current_user_role() in ('admin', 'mod')) as can_resolve
  from report_base rb
  left join lateral (
    select
      count(*) filter (where vote_type = 'confirm') as confirms,
      count(*) filter (where vote_type = 'dispute') as disputes
    from public.report_votes rv
    where rv.report_id = rb.id
  ) v on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', rm.id,
        'storage_path', rm.storage_path,
        'media_type', rm.media_type
      )
      order by rm.created_at asc
    ) as media
    from public.report_media rm
    where rm.report_id = rb.id
  ) m on true
  left join lateral (
    select rv.vote_type
    from public.report_votes rv
    where rv.report_id = rb.id and rv.voter_id = auth.uid()
    limit 1
  ) uv on true;
$$;

grant execute on function public.get_report_detail(uuid) to anon, authenticated;

-- Updated at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notification_subscriptions_touch_updated_at on public.notification_subscriptions;
create trigger notification_subscriptions_touch_updated_at
before update on public.notification_subscriptions
for each row
execute function public.touch_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.report_media enable row level security;
alter table public.report_votes enable row level security;
alter table public.flags enable row level security;
alter table public.notification_subscriptions enable row level security;

-- profiles: own read, own update, admin/mod read all
create policy "profiles_select_own_or_staff"
on public.profiles
for select
using (
  id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

create policy "profiles_update_own_or_staff"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
)
with check (
  id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

-- reports: public read, authenticated create as self, owner or staff modify
create policy "reports_public_read"
on public.reports
for select
using (true);

create policy "reports_insert_authenticated_self"
on public.reports
for insert
to authenticated
with check (reporter_id = auth.uid());

create policy "reports_update_owner_or_staff"
on public.reports
for update
to authenticated
using (
  reporter_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
)
with check (
  reporter_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

create policy "reports_delete_owner_or_staff"
on public.reports
for delete
to authenticated
using (
  reporter_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

-- report_media: public read, authenticated insert if owns report or staff
create policy "report_media_public_read"
on public.report_media
for select
using (true);

create policy "report_media_insert_owner_or_staff"
on public.report_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.reports r
    where r.id = report_id
      and (r.reporter_id = auth.uid() or public.current_user_role() in ('admin', 'mod'))
  )
);

create policy "report_media_delete_owner_or_staff"
on public.report_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.reports r
    where r.id = report_id
      and (r.reporter_id = auth.uid() or public.current_user_role() in ('admin', 'mod'))
  )
);

-- report_votes: public read, authenticated insert self, owner/staff update/delete
create policy "report_votes_public_read"
on public.report_votes
for select
using (true);

create policy "report_votes_insert_self"
on public.report_votes
for insert
to authenticated
with check (voter_id = auth.uid());

create policy "report_votes_update_self_or_staff"
on public.report_votes
for update
to authenticated
using (
  voter_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
)
with check (
  voter_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

create policy "report_votes_delete_self_or_staff"
on public.report_votes
for delete
to authenticated
using (
  voter_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

-- flags: authenticated create self, staff view
create policy "flags_insert_self"
on public.flags
for insert
to authenticated
with check (reporter_id = auth.uid());

create policy "flags_staff_read"
on public.flags
for select
to authenticated
using (public.current_user_role() in ('admin', 'mod'));

-- notification subscriptions: own CRUD
create policy "notification_subscriptions_select_own"
on public.notification_subscriptions
for select
to authenticated
using (user_id = auth.uid());

create policy "notification_subscriptions_insert_own"
on public.notification_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "notification_subscriptions_update_own"
on public.notification_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Storage bucket + policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-media', 'report-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "report_media_public_object_read"
on storage.objects
for select
using (bucket_id = 'report-media');

create policy "report_media_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'report-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "report_media_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'report-media'
  and owner = auth.uid()
);
