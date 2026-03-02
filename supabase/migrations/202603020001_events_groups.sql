set search_path = public, extensions;

-- Rollback guide (manual, reverse order):
-- 1) Drop new API helpers / RPC functions:
--    drop function if exists public.delete_group_atomic(uuid);
--    drop function if exists public.toggle_group_visibility(uuid, text);
--    drop function if exists public.respond_to_join_request(uuid, uuid, text);
--    drop function if exists public.request_to_join_group(uuid);
--    drop function if exists public.create_group_atomic(text, text, text, text);
--    drop function if exists public.can_access_group_content(uuid, uuid);
--    drop function if exists public.can_manage_group(uuid, uuid);
--    drop function if exists public.is_group_member_accepted(uuid, uuid);
--    drop function if exists public.is_mod(uuid);
-- 2) Drop RLS policies on events/groups/group_members/group_chat_messages and restore prior reports/comment policies.
-- 3) Drop tables in dependency order:
--    drop table if exists public.event_rsvps;
--    drop table if exists public.events;
--    drop table if exists public.group_chat_messages;
--    drop table if exists public.group_members;
--    drop table if exists public.groups;
-- 4) Optional: remove nullable linkage columns/indexes from reports if no longer needed.

create or replace function public.is_mod(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and p.role in ('mod', 'admin')
  );
$$;

grant execute on function public.is_mod(uuid) to anon, authenticated;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  city text not null default 'Fall River, MA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_length check (char_length(btrim(name)) between 3 and 50),
  constraint groups_description_length check (description is null or char_length(description) <= 300)
);

create index if not exists groups_owner_user_id_idx on public.groups (owner_user_id);
create index if not exists groups_visibility_idx on public.groups (visibility);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'mod', 'member')),
  status text not null default 'accepted' check (status in ('pending', 'accepted', 'rejected', 'banned')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists group_members_group_status_idx on public.group_members (group_id, status);

create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  constraint group_chat_messages_length check (char_length(btrim(message)) between 1 and 1000)
);

create index if not exists group_chat_messages_group_created_idx on public.group_chat_messages (group_id, created_at);
create index if not exists group_chat_messages_user_idx on public.group_chat_messages (user_id, created_at desc);

alter table public.reports
  add column if not exists group_id uuid references public.groups(id) on delete set null;

create index if not exists reports_group_id_idx on public.reports (group_id);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null check (category in ('meeting', 'protest', 'community', 'roadwork', 'safety', 'other')),
  start_at timestamptz not null,
  end_at timestamptz,
  location_name text not null,
  address text,
  lat numeric not null,
  lng numeric not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'canceled', 'moved', 'ended')),
  visibility text not null default 'public' check (visibility in ('public', 'group_only')),
  group_id uuid references public.groups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_length check (char_length(btrim(title)) between 3 and 80),
  constraint events_description_length check (char_length(btrim(description)) >= 10),
  constraint events_time_range check (end_at is null or end_at >= start_at),
  constraint events_lat_range check (lat >= -90 and lat <= 90),
  constraint events_lng_range check (lng >= -180 and lng <= 180)
);

create index if not exists events_start_at_idx on public.events (start_at);
create index if not exists events_group_id_idx on public.events (group_id);
create index if not exists events_lat_lng_idx on public.events (lat, lng);
create index if not exists events_creator_user_id_idx on public.events (creator_user_id);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_rsvps_user_id_idx on public.event_rsvps (user_id);

-- Reuse existing generic updated_at trigger function.
drop trigger if exists groups_touch_updated_at on public.groups;
create trigger groups_touch_updated_at
before update on public.groups
for each row
execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
before update on public.events
for each row
execute function public.touch_updated_at();

create or replace function public.is_group_member_accepted(p_group_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_uid is not null
    and exists (
      select 1
      from public.group_members gm
      where gm.group_id = p_group_id
        and gm.user_id = p_uid
        and gm.status = 'accepted'
    );
$$;

grant execute on function public.is_group_member_accepted(uuid, uuid) to anon, authenticated;

create or replace function public.can_manage_group(p_group_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_uid is not null
    and (
      public.is_mod(p_uid)
      or exists (
        select 1
        from public.groups g
        where g.id = p_group_id
          and g.owner_user_id = p_uid
      )
      or exists (
        select 1
        from public.group_members gm
        where gm.group_id = p_group_id
          and gm.user_id = p_uid
          and gm.status = 'accepted'
          and gm.role = 'mod'
      )
    );
$$;

grant execute on function public.can_manage_group(uuid, uuid) to anon, authenticated;

create or replace function public.can_access_group_content(p_group_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_group_id is null
    or public.is_mod(p_uid)
    or public.is_group_member_accepted(p_group_id, p_uid);
$$;

grant execute on function public.can_access_group_content(uuid, uuid) to anon, authenticated;

-- Hard-enforced group create (one group max for non-mod users + owner membership).
create or replace function public.create_group_atomic(
  p_name text,
  p_description text default null,
  p_visibility text default 'public',
  p_city text default 'Fall River, MA'
)
returns public.groups
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_group_count integer := 0;
  v_base_slug text;
  v_slug text;
  v_try integer := 0;
  v_group public.groups%rowtype;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if p_visibility not in ('public', 'private') then
    raise exception using message = 'Invalid visibility', errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) < 3 or char_length(btrim(coalesce(p_name, ''))) > 50 then
    raise exception using message = 'Group name must be 3 to 50 characters', errcode = '22023';
  end if;

  if p_description is not null and char_length(p_description) > 300 then
    raise exception using message = 'Description must be 300 characters or fewer', errcode = '22023';
  end if;

  if not public.is_mod(v_uid) then
    select count(*)
    into v_owner_group_count
    from public.groups g
    where g.owner_user_id = v_uid;

    if v_owner_group_count >= 1 then
      raise exception using message = 'Only one owned group is allowed for this account', errcode = '23514';
    end if;
  end if;

  v_base_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_base_slug := trim(both '-' from v_base_slug);
  if char_length(v_base_slug) < 2 then
    v_base_slug := 'group';
  end if;

  loop
    exit when v_try >= 8;
    v_try := v_try + 1;
    v_slug := v_base_slug || '-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6);

    begin
      insert into public.groups (
        owner_user_id,
        name,
        slug,
        description,
        visibility,
        city
      )
      values (
        v_uid,
        btrim(p_name),
        v_slug,
        nullif(btrim(coalesce(p_description, '')), ''),
        p_visibility,
        coalesce(nullif(btrim(p_city), ''), 'Fall River, MA')
      )
      returning * into v_group;

      exit;
    exception
      when unique_violation then
        -- Retry slug generation.
        continue;
    end;
  end loop;

  if v_group.id is null then
    raise exception using message = 'Failed to generate unique group slug', errcode = '23505';
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_group.id, v_uid, 'owner', 'accepted')
  on conflict (group_id, user_id) do update
  set role = 'owner', status = 'accepted';

  return v_group;
end;
$$;

revoke all on function public.create_group_atomic(text, text, text, text) from public;
grant execute on function public.create_group_atomic(text, text, text, text) to authenticated;

create or replace function public.request_to_join_group(p_group_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_visibility text;
  v_existing public.group_members%rowtype;
  v_target_status text;
  v_row public.group_members%rowtype;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  select g.visibility
  into v_visibility
  from public.groups g
  where g.id = p_group_id;

  if v_visibility is null then
    raise exception using message = 'Group not found', errcode = 'P0002';
  end if;

  select *
  into v_existing
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = v_uid
  for update;

  if found and v_existing.status = 'banned' then
    raise exception using message = 'You are banned from this group', errcode = '42501';
  end if;

  v_target_status := case when v_visibility = 'public' then 'accepted' else 'pending' end;

  insert into public.group_members (group_id, user_id, role, status)
  values (p_group_id, v_uid, coalesce(v_existing.role, 'member'), v_target_status)
  on conflict (group_id, user_id)
  do update
  set
    status = case
      when public.group_members.status = 'banned' then 'banned'
      when public.group_members.role = 'owner' then 'accepted'
      else excluded.status
    end,
    role = case
      when public.group_members.role in ('owner', 'mod') then public.group_members.role
      else 'member'
    end
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.request_to_join_group(uuid) from public;
grant execute on function public.request_to_join_group(uuid) to authenticated;

create or replace function public.respond_to_join_request(
  p_group_id uuid,
  p_user_id uuid,
  p_decision text
)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_row public.group_members%rowtype;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if not public.can_manage_group(p_group_id, v_uid) then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  if p_decision not in ('accept', 'reject') then
    raise exception using message = 'Invalid decision', errcode = '22023';
  end if;

  v_status := case when p_decision = 'accept' then 'accepted' else 'rejected' end;

  update public.group_members gm
  set status = v_status
  where gm.group_id = p_group_id
    and gm.user_id = p_user_id
    and gm.role <> 'owner'
  returning * into v_row;

  if v_row.group_id is null then
    insert into public.group_members (group_id, user_id, role, status)
    values (p_group_id, p_user_id, 'member', v_status)
    on conflict (group_id, user_id)
    do update set status = excluded.status
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.respond_to_join_request(uuid, uuid, text) from public;
grant execute on function public.respond_to_join_request(uuid, uuid, text) to authenticated;

create or replace function public.toggle_group_visibility(
  p_group_id uuid,
  p_visibility text
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group public.groups%rowtype;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if p_visibility not in ('public', 'private') then
    raise exception using message = 'Invalid visibility', errcode = '22023';
  end if;

  if not public.can_manage_group(p_group_id, v_uid) then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  update public.groups g
  set visibility = p_visibility,
      updated_at = now()
  where g.id = p_group_id
  returning * into v_group;

  if v_group.id is null then
    raise exception using message = 'Group not found', errcode = 'P0002';
  end if;

  return v_group;
end;
$$;

revoke all on function public.toggle_group_visibility(uuid, text) from public;
grant execute on function public.toggle_group_visibility(uuid, text) to authenticated;

create or replace function public.delete_group_atomic(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if not public.can_manage_group(p_group_id, v_uid) then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  delete from public.groups g
  where g.id = p_group_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.delete_group_atomic(uuid) from public;
grant execute on function public.delete_group_atomic(uuid) to authenticated;

create or replace function public.get_group_member_counts(p_group_ids uuid[])
returns table (
  group_id uuid,
  accepted_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    gm.group_id,
    count(*) filter (where gm.status = 'accepted')::int as accepted_count
  from public.group_members gm
  where gm.group_id = any(coalesce(p_group_ids, array[]::uuid[]))
  group by gm.group_id;
$$;

revoke all on function public.get_group_member_counts(uuid[]) from public;
grant execute on function public.get_group_member_counts(uuid[]) to anon, authenticated;

create or replace function public.get_event_rsvp_summary(p_event_ids uuid[])
returns table (
  event_id uuid,
  going_count int,
  interested_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id as event_id,
    count(*) filter (where er.status = 'going')::int as going_count,
    count(*) filter (where er.status = 'interested')::int as interested_count
  from public.events e
  left join public.event_rsvps er on er.event_id = e.id
  where e.id = any(coalesce(p_event_ids, array[]::uuid[]))
    and (
      e.visibility = 'public'
      or e.creator_user_id = auth.uid()
      or public.is_mod(auth.uid())
      or (
        e.visibility = 'group_only'
        and e.group_id is not null
        and public.can_access_group_content(e.group_id, auth.uid())
      )
    )
  group by e.id;
$$;

revoke all on function public.get_event_rsvp_summary(uuid[]) from public;
grant execute on function public.get_event_rsvp_summary(uuid[]) to anon, authenticated;

-- Keep incident/report RPCs safe for group-restricted content.
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
      and (
        r.group_id is null
        or public.can_access_group_content(r.group_id, auth.uid())
      )
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

revoke all on function public.get_report_detail(uuid) from public;
grant execute on function public.get_report_detail(uuid) to anon, authenticated;

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
      and (
        r.group_id is null
        or public.can_access_group_content(r.group_id, auth.uid())
      )
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
    and (
      r.group_id is null
      or public.can_access_group_content(r.group_id, auth.uid())
    )
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
    and exists (
      select 1
      from public.reports r
      where r.id = c.incident_id
        and (
          r.group_id is null
          or public.can_access_group_content(r.group_id, auth.uid())
        )
    )
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
    and exists (
      select 1
      from public.reports r
      where r.id = c.incident_id
        and (
          r.group_id is null
          or public.can_access_group_content(r.group_id, auth.uid())
        )
    )
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

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_chat_messages enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

-- Harden reports visibility for group-linked content.
drop policy if exists "reports_public_read" on public.reports;
drop policy if exists "reports_select_public_or_group_member" on public.reports;
create policy "reports_select_public_or_group_member"
on public.reports
for select
using (
  group_id is null
  or public.can_access_group_content(group_id, auth.uid())
);

drop policy if exists "reports_insert_authenticated_self" on public.reports;
drop policy if exists "reports_insert_authenticated_self_with_group" on public.reports;
create policy "reports_insert_authenticated_self_with_group"
on public.reports
for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and (
    group_id is null
    or public.can_access_group_content(group_id, auth.uid())
  )
);

-- Align incident discussion policies with group-linked report visibility.
drop policy if exists "incident_comments_public_read" on public.incident_comments;
create policy "incident_comments_public_read"
on public.incident_comments
for select
using (
  exists (
    select 1
    from public.reports r
    where r.id = incident_id
      and (
        r.group_id is null
        or public.can_access_group_content(r.group_id, auth.uid())
      )
  )
);

drop policy if exists "incident_comments_insert_self" on public.incident_comments;
create policy "incident_comments_insert_self"
on public.incident_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.reports r
    where r.id = incident_id
      and (
        r.group_id is null
        or public.can_access_group_content(r.group_id, auth.uid())
      )
  )
);

drop policy if exists "incident_attachments_public_read" on public.incident_attachments;
create policy "incident_attachments_public_read"
on public.incident_attachments
for select
using (
  (incident_id is not null and exists (
    select 1 from public.reports r
    where r.id = incident_id
      and (
        r.group_id is null
        or public.can_access_group_content(r.group_id, auth.uid())
      )
  ))
  or (
    comment_id is not null and exists (
      select 1
      from public.incident_comments c
      join public.reports r on r.id = c.incident_id
      where c.id = comment_id
        and (
          r.group_id is null
          or public.can_access_group_content(r.group_id, auth.uid())
        )
    )
  )
);

drop policy if exists "incident_attachments_insert_self" on public.incident_attachments;
create policy "incident_attachments_insert_self"
on public.incident_attachments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    (incident_id is not null and exists (
      select 1
      from public.reports r
      where r.id = incident_id
        and (
          r.group_id is null
          or public.can_access_group_content(r.group_id, auth.uid())
        )
    ))
    or (
      comment_id is not null and exists (
        select 1
        from public.incident_comments c
        join public.reports r on r.id = c.incident_id
        where c.id = comment_id
          and (
            r.group_id is null
            or public.can_access_group_content(r.group_id, auth.uid())
          )
      )
    )
  )
);

-- Groups policies.
drop policy if exists "groups_select_all" on public.groups;
create policy "groups_select_all"
on public.groups
for select
using (true);

drop policy if exists "groups_insert_denied" on public.groups;
create policy "groups_insert_denied"
on public.groups
for insert
to authenticated
with check (false);

drop policy if exists "groups_update_owner_or_mod" on public.groups;
create policy "groups_update_owner_or_mod"
on public.groups
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_mod(auth.uid())
)
with check (
  owner_user_id = auth.uid()
  or public.is_mod(auth.uid())
);

drop policy if exists "groups_delete_owner_or_mod" on public.groups;
create policy "groups_delete_owner_or_mod"
on public.groups
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_mod(auth.uid())
);

-- Group members policies.
drop policy if exists "group_members_select_scoped" on public.group_members;
create policy "group_members_select_scoped"
on public.group_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_manage_group(group_id, auth.uid())
  or (
    status = 'accepted'
    and public.is_group_member_accepted(group_id, auth.uid())
  )
);

drop policy if exists "group_members_insert_mod_only" on public.group_members;
create policy "group_members_insert_mod_only"
on public.group_members
for insert
to authenticated
with check (public.is_mod(auth.uid()));

drop policy if exists "group_members_update_owner_or_mod" on public.group_members;
create policy "group_members_update_owner_or_mod"
on public.group_members
for update
to authenticated
using (public.can_manage_group(group_id, auth.uid()))
with check (public.can_manage_group(group_id, auth.uid()));

drop policy if exists "group_members_delete_rules" on public.group_members;
create policy "group_members_delete_rules"
on public.group_members
for delete
to authenticated
using (
  (
    public.can_manage_group(group_id, auth.uid())
    and role <> 'owner'
  )
  or (
    user_id = auth.uid()
    and role <> 'owner'
    and status = 'accepted'
    and exists (
      select 1
      from public.groups g
      where g.id = group_id
        and g.visibility = 'public'
    )
  )
);

-- Group chat policies.
drop policy if exists "group_chat_messages_select_member_or_mod" on public.group_chat_messages;
create policy "group_chat_messages_select_member_or_mod"
on public.group_chat_messages
for select
to authenticated
using (public.can_access_group_content(group_id, auth.uid()));

drop policy if exists "group_chat_messages_insert_member_or_mod" on public.group_chat_messages;
create policy "group_chat_messages_insert_member_or_mod"
on public.group_chat_messages
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_access_group_content(group_id, auth.uid())
);

drop policy if exists "group_chat_messages_delete_owner_or_manager" on public.group_chat_messages;
create policy "group_chat_messages_delete_owner_or_manager"
on public.group_chat_messages
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.can_manage_group(group_id, auth.uid())
);

-- Events policies.
drop policy if exists "events_select_visibility" on public.events;
create policy "events_select_visibility"
on public.events
for select
using (
  visibility = 'public'
  or creator_user_id = auth.uid()
  or public.is_mod(auth.uid())
  or (
    visibility = 'group_only'
    and group_id is not null
    and public.can_access_group_content(group_id, auth.uid())
  )
);

drop policy if exists "events_insert_authenticated" on public.events;
create policy "events_insert_authenticated"
on public.events
for insert
to authenticated
with check (
  creator_user_id = auth.uid()
  and (
    group_id is null
    or public.can_access_group_content(group_id, auth.uid())
  )
);

drop policy if exists "events_update_owner_or_mod" on public.events;
create policy "events_update_owner_or_mod"
on public.events
for update
to authenticated
using (
  creator_user_id = auth.uid()
  or public.is_mod(auth.uid())
)
with check (
  creator_user_id = auth.uid()
  or public.is_mod(auth.uid())
);

drop policy if exists "events_delete_owner_or_mod" on public.events;
create policy "events_delete_owner_or_mod"
on public.events
for delete
to authenticated
using (
  creator_user_id = auth.uid()
  or public.is_mod(auth.uid())
);

-- Event RSVP policies.
drop policy if exists "event_rsvps_select_own_or_mod" on public.event_rsvps;
create policy "event_rsvps_select_own_or_mod"
on public.event_rsvps
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_mod(auth.uid())
);

drop policy if exists "event_rsvps_insert_own_or_mod" on public.event_rsvps;
create policy "event_rsvps_insert_own_or_mod"
on public.event_rsvps
for insert
to authenticated
with check (
  (user_id = auth.uid() or public.is_mod(auth.uid()))
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and (
        e.visibility = 'public'
        or e.creator_user_id = auth.uid()
        or public.is_mod(auth.uid())
        or (
          e.visibility = 'group_only'
          and e.group_id is not null
          and public.can_access_group_content(e.group_id, auth.uid())
        )
      )
  )
);

drop policy if exists "event_rsvps_update_own_or_mod" on public.event_rsvps;
create policy "event_rsvps_update_own_or_mod"
on public.event_rsvps
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_mod(auth.uid())
)
with check (
  user_id = auth.uid()
  or public.is_mod(auth.uid())
);

drop policy if exists "event_rsvps_delete_own_or_mod" on public.event_rsvps;
create policy "event_rsvps_delete_own_or_mod"
on public.event_rsvps
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_mod(auth.uid())
);

-- Realtime support for group chat.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_chat_messages'
  ) then
    alter publication supabase_realtime add table public.group_chat_messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';
