set search_path = public, extensions;

-- Extend reports (incident model) with anonymity + optional danger radius metadata.
alter table public.reports
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists danger_radius_meters integer,
  add column if not exists danger_center_lat double precision,
  add column if not exists danger_center_lng double precision;

-- Keep danger radius storage canonical in meters and enforce center consistency.
alter table public.reports
  drop constraint if exists reports_danger_radius_check,
  drop constraint if exists reports_danger_center_pair_check,
  drop constraint if exists reports_danger_fields_consistency_check;

alter table public.reports
  add constraint reports_danger_radius_check
    check (danger_radius_meters is null or danger_radius_meters between 50 and 5000),
  add constraint reports_danger_center_pair_check
    check (
      (danger_center_lat is null and danger_center_lng is null)
      or (danger_center_lat between -90 and 90 and danger_center_lng between -180 and 180)
    ),
  add constraint reports_danger_fields_consistency_check
    check (
      danger_radius_meters is null
      or (danger_center_lat is not null and danger_center_lng is not null)
    );

-- Backfill center coordinates for existing rows that may later add radius.
update public.reports
set
  danger_center_lat = st_y(location::geometry),
  danger_center_lng = st_x(location::geometry)
where danger_center_lat is null
  and danger_center_lng is null;

-- Existing indexes cover category/created_at. Add geometry expression indexes to support bbox queries.
create index if not exists reports_location_geom_gix on public.reports using gist ((location::geometry));
create index if not exists reports_obfuscated_location_geom_gix on public.reports using gist ((obfuscated_location::geometry));

create or replace function public.get_profile_display_names(p_user_ids uuid[])
returns table (
  user_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Neighbor') as display_name
  from public.profiles p
  where p.id = any(coalesce(p_user_ids, array[]::uuid[]));
$$;

revoke all on function public.get_profile_display_names(uuid[]) from public;
grant execute on function public.get_profile_display_names(uuid[]) to anon, authenticated;

create table if not exists public.incident_comments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.incident_comments(id) on delete cascade,
  body text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incident_comments_parent_self_check check (parent_id is null or parent_id <> id),
  constraint incident_comments_body_length_check check (char_length(btrim(body)) between 1 and 2000)
);

-- Enforce same-incident replies and depth=1 at DB level for safety.
create or replace function public.enforce_incident_comment_depth()
returns trigger
language plpgsql
as $$
declare
  v_parent_incident_id uuid;
  v_parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent.incident_id, parent.parent_id
  into v_parent_incident_id, v_parent_parent_id
  from public.incident_comments parent
  where parent.id = new.parent_id;

  if v_parent_incident_id is null then
    raise exception using message = 'Parent comment not found', errcode = '23503';
  end if;

  if v_parent_incident_id <> new.incident_id then
    raise exception using message = 'Reply must belong to same incident', errcode = '23514';
  end if;

  if v_parent_parent_id is not null then
    raise exception using message = 'Replies can only target top-level comments', errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists incident_comments_depth_trigger on public.incident_comments;
create trigger incident_comments_depth_trigger
before insert or update of parent_id, incident_id on public.incident_comments
for each row
execute function public.enforce_incident_comment_depth();

drop trigger if exists incident_comments_touch_updated_at on public.incident_comments;
create trigger incident_comments_touch_updated_at
before update on public.incident_comments
for each row
execute function public.touch_updated_at();

create index if not exists incident_comments_incident_created_idx
  on public.incident_comments (incident_id, created_at desc, id desc)
  where parent_id is null;
create index if not exists incident_comments_parent_created_idx
  on public.incident_comments (parent_id, created_at asc, id asc)
  where parent_id is not null;
create index if not exists incident_comments_user_created_idx
  on public.incident_comments (user_id, created_at desc);

create table if not exists public.incident_attachments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.reports(id) on delete cascade,
  comment_id uuid references public.incident_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  constraint incident_attachments_one_target_check check (
    (incident_id is not null and comment_id is null)
    or (incident_id is null and comment_id is not null)
  )
);

create index if not exists incident_attachments_incident_idx on public.incident_attachments (incident_id);
create index if not exists incident_attachments_comment_idx on public.incident_attachments (comment_id);
create index if not exists incident_attachments_user_idx on public.incident_attachments (user_id);

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.incident_comments(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_user_id)
);

create index if not exists comment_reports_comment_idx on public.comment_reports (comment_id);
create index if not exists comment_reports_created_idx on public.comment_reports (created_at desc);

create or replace function public.get_incidents_bbox(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_categories text[] default null,
  p_hours integer default null,
  p_limit integer default 200,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  category text,
  title text,
  description text,
  severity int,
  status text,
  created_at timestamptz,
  lat double precision,
  lng double precision,
  is_anonymous boolean,
  author_display_name text,
  danger_radius_meters integer,
  danger_center_lat double precision,
  danger_center_lng double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with scoped as (
    select
      r.*,
      case
        when r.category = 'suspicious_activity' then r.obfuscated_location
        else r.location
      end as display_location
    from public.reports r
    where
      (p_hours is null or r.created_at >= (now() - make_interval(hours => greatest(p_hours, 1))))
      and (coalesce(array_length(p_categories, 1), 0) = 0 or r.category = any(p_categories))
      and (
        p_cursor_created_at is null
        or r.created_at < p_cursor_created_at
        or (r.created_at = p_cursor_created_at and p_cursor_id is not null and r.id < p_cursor_id)
      )
      and (
        (
          p_west <= p_east
          and (
            (r.category = 'suspicious_activity' and st_intersects(r.obfuscated_location::geometry, st_makeenvelope(p_west, p_south, p_east, p_north, 4326)))
            or (r.category <> 'suspicious_activity' and st_intersects(r.location::geometry, st_makeenvelope(p_west, p_south, p_east, p_north, 4326)))
          )
        )
        or (
          p_west > p_east
          and (
            (r.category = 'suspicious_activity' and (
              st_intersects(r.obfuscated_location::geometry, st_makeenvelope(p_west, p_south, 180, p_north, 4326))
              or st_intersects(r.obfuscated_location::geometry, st_makeenvelope(-180, p_south, p_east, p_north, 4326))
            ))
            or (r.category <> 'suspicious_activity' and (
              st_intersects(r.location::geometry, st_makeenvelope(p_west, p_south, 180, p_north, 4326))
              or st_intersects(r.location::geometry, st_makeenvelope(-180, p_south, p_east, p_north, 4326))
            ))
          )
        )
      )
  )
  select
    s.id,
    s.category,
    s.title,
    s.description,
    s.severity,
    s.status,
    s.created_at,
    st_y(s.display_location::geometry) as lat,
    st_x(s.display_location::geometry) as lng,
    s.is_anonymous,
    case
      when s.is_anonymous then 'Anonymous'
      else coalesce(nullif(btrim(p.display_name), ''), 'Neighbor')
    end as author_display_name,
    s.danger_radius_meters,
    s.danger_center_lat,
    s.danger_center_lng
  from scoped s
  left join public.profiles p on p.id = s.reporter_id
  order by s.created_at desc, s.id desc
  limit greatest(1, least(p_limit, 500));
$$;

revoke all on function public.get_incidents_bbox(double precision, double precision, double precision, double precision, text[], integer, integer, timestamptz, uuid) from public;
grant execute on function public.get_incidents_bbox(double precision, double precision, double precision, double precision, text[], integer, integer, timestamptz, uuid) to anon, authenticated;

create or replace function public.get_incident_detail(p_incident_id uuid)
returns table (
  id uuid,
  category text,
  title text,
  description text,
  severity int,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  lat double precision,
  lng double precision,
  is_anonymous boolean,
  author_display_name text,
  danger_radius_meters integer,
  danger_center_lat double precision,
  danger_center_lng double precision,
  top_level_comment_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    r.id,
    r.category,
    r.title,
    r.description,
    r.severity,
    r.status,
    r.created_at,
    r.updated_at,
    st_y(
      case
        when r.category = 'suspicious_activity' then r.obfuscated_location::geometry
        else r.location::geometry
      end
    ) as lat,
    st_x(
      case
        when r.category = 'suspicious_activity' then r.obfuscated_location::geometry
        else r.location::geometry
      end
    ) as lng,
    r.is_anonymous,
    case
      when r.is_anonymous then 'Anonymous'
      else coalesce(nullif(btrim(p.display_name), ''), 'Neighbor')
    end as author_display_name,
    r.danger_radius_meters,
    r.danger_center_lat,
    r.danger_center_lng,
    (
      select count(*)
      from public.incident_comments c
      where c.incident_id = r.id
        and c.parent_id is null
    ) as top_level_comment_count
  from public.reports r
  left join public.profiles p on p.id = r.reporter_id
  where r.id = p_incident_id
  limit 1;
$$;

revoke all on function public.get_incident_detail(uuid) from public;
grant execute on function public.get_incident_detail(uuid) to anon, authenticated;

create or replace function public.get_incident_comments_page(
  p_incident_id uuid,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  incident_id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  is_anonymous boolean,
  author_display_name text,
  reply_count bigint,
  is_owner boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.incident_id,
    c.parent_id,
    c.body,
    c.created_at,
    c.updated_at,
    c.is_anonymous,
    case
      when c.is_anonymous then 'Anonymous'
      else coalesce(nullif(btrim(p.display_name), ''), 'Neighbor')
    end as author_display_name,
    (
      select count(*)
      from public.incident_comments r
      where r.parent_id = c.id
    ) as reply_count,
    (c.user_id = auth.uid()) as is_owner
  from public.incident_comments c
  left join public.profiles p on p.id = c.user_id
  where c.incident_id = p_incident_id
    and c.parent_id is null
    and (
      p_cursor_created_at is null
      or c.created_at < p_cursor_created_at
      or (c.created_at = p_cursor_created_at and p_cursor_id is not null and c.id < p_cursor_id)
    )
  order by c.created_at desc, c.id desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.get_incident_comments_page(uuid, integer, timestamptz, uuid) from public;
grant execute on function public.get_incident_comments_page(uuid, integer, timestamptz, uuid) to anon, authenticated;

create or replace function public.get_comment_replies_page(
  p_parent_id uuid,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  incident_id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  is_anonymous boolean,
  author_display_name text,
  is_owner boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.incident_id,
    c.parent_id,
    c.body,
    c.created_at,
    c.updated_at,
    c.is_anonymous,
    case
      when c.is_anonymous then 'Anonymous'
      else coalesce(nullif(btrim(p.display_name), ''), 'Neighbor')
    end as author_display_name,
    (c.user_id = auth.uid()) as is_owner
  from public.incident_comments c
  left join public.profiles p on p.id = c.user_id
  where c.parent_id = p_parent_id
    and (
      p_cursor_created_at is null
      or c.created_at > p_cursor_created_at
      or (c.created_at = p_cursor_created_at and p_cursor_id is not null and c.id > p_cursor_id)
    )
  order by c.created_at asc, c.id asc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.get_comment_replies_page(uuid, integer, timestamptz, uuid) from public;
grant execute on function public.get_comment_replies_page(uuid, integer, timestamptz, uuid) to anon, authenticated;

alter table public.incident_comments enable row level security;
alter table public.incident_attachments enable row level security;
alter table public.comment_reports enable row level security;

-- Incident comments: public read, auth write as owner.
drop policy if exists "incident_comments_public_read" on public.incident_comments;
create policy "incident_comments_public_read"
on public.incident_comments
for select
using (true);

drop policy if exists "incident_comments_insert_self" on public.incident_comments;
create policy "incident_comments_insert_self"
on public.incident_comments
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "incident_comments_update_owner" on public.incident_comments;
create policy "incident_comments_update_owner"
on public.incident_comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "incident_comments_delete_owner" on public.incident_comments;
create policy "incident_comments_delete_owner"
on public.incident_comments
for delete
to authenticated
using (user_id = auth.uid());

-- Incident attachments: readable when target incident/comment is readable; writable by uploader.
drop policy if exists "incident_attachments_public_read" on public.incident_attachments;
create policy "incident_attachments_public_read"
on public.incident_attachments
for select
using (
  (incident_id is not null and exists (select 1 from public.reports r where r.id = incident_id))
  or (comment_id is not null and exists (select 1 from public.incident_comments c where c.id = comment_id))
);

drop policy if exists "incident_attachments_insert_self" on public.incident_attachments;
create policy "incident_attachments_insert_self"
on public.incident_attachments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    (incident_id is not null and exists (select 1 from public.reports r where r.id = incident_id))
    or (comment_id is not null and exists (select 1 from public.incident_comments c where c.id = comment_id))
  )
);

drop policy if exists "incident_attachments_update_owner" on public.incident_attachments;
create policy "incident_attachments_update_owner"
on public.incident_attachments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "incident_attachments_delete_owner" on public.incident_attachments;
create policy "incident_attachments_delete_owner"
on public.incident_attachments
for delete
to authenticated
using (user_id = auth.uid());

-- Comment reports: any authenticated user can report once.
drop policy if exists "comment_reports_insert_self" on public.comment_reports;
create policy "comment_reports_insert_self"
on public.comment_reports
for insert
to authenticated
with check (reporter_user_id = auth.uid());

drop policy if exists "comment_reports_staff_read" on public.comment_reports;
create policy "comment_reports_staff_read"
on public.comment_reports
for select
to authenticated
using (public.current_user_role() in ('admin', 'mod'));

-- Private evidence bucket using signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('incident-evidence', 'incident-evidence', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "incident_evidence_authenticated_upload" on storage.objects;
create policy "incident_evidence_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'incident-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "incident_evidence_authenticated_read" on storage.objects;
create policy "incident_evidence_authenticated_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'incident-evidence');

drop policy if exists "incident_evidence_owner_delete" on storage.objects;
create policy "incident_evidence_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'incident-evidence'
  and owner = auth.uid()
);

notify pgrst, 'reload schema';
