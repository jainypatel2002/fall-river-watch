set search_path = public, extensions;

-- Ensure profiles.role exists as the shared moderation source of truth.
alter table if exists public.profiles
  add column if not exists role text;

update public.profiles
set role = 'user'
where role is null;

alter table if exists public.profiles
  alter column role set default 'user';

alter table if exists public.profiles
  alter column role set not null;

alter table if exists public.profiles
  drop constraint if exists profiles_role_check;

alter table if exists public.profiles
  add constraint profiles_role_check check (role in ('user', 'mod', 'admin'));

-- Shared helpers for authorization checks.
create or replace function public.is_global_mod_or_admin(p_uid uuid)
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

grant execute on function public.is_global_mod_or_admin(uuid) to anon, authenticated;

create or replace function public.is_group_accepted_member(p_group_id uuid, p_uid uuid)
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

grant execute on function public.is_group_accepted_member(uuid, uuid) to anon, authenticated;

create or replace function public.is_group_manager(p_group_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_uid is not null
    and (
      public.is_global_mod_or_admin(p_uid)
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

grant execute on function public.is_group_manager(uuid, uuid) to anon, authenticated;

-- Groups core table (idempotent hardening).
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.groups
  add column if not exists name text;
alter table public.groups
  add column if not exists slug text;
alter table public.groups
  add column if not exists description text;
alter table public.groups
  add column if not exists visibility text default 'public';
alter table public.groups
  add column if not exists created_at timestamptz default now();
alter table public.groups
  add column if not exists updated_at timestamptz default now();

update public.groups
set visibility = 'public'
where visibility is null;

update public.groups
set name = coalesce(nullif(btrim(name), ''), 'Group')
where name is null or btrim(name) = '';

update public.groups
set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6)
where slug is null or btrim(slug) = '';

alter table public.groups
  alter column owner_user_id set not null;
alter table public.groups
  alter column name set not null;
alter table public.groups
  alter column slug set not null;
alter table public.groups
  alter column visibility set not null;
alter table public.groups
  alter column visibility set default 'public';
alter table public.groups
  alter column created_at set not null;
alter table public.groups
  alter column created_at set default now();
alter table public.groups
  alter column updated_at set not null;
alter table public.groups
  alter column updated_at set default now();

alter table public.groups
  drop constraint if exists groups_visibility_check;
alter table public.groups
  add constraint groups_visibility_check check (visibility in ('public', 'private'));

alter table public.groups
  drop constraint if exists groups_name_length;
alter table public.groups
  add constraint groups_name_length check (char_length(btrim(name)) >= 3);

alter table public.groups
  drop constraint if exists groups_description_length;
alter table public.groups
  add constraint groups_description_length check (description is null or char_length(description) <= 300);

create unique index if not exists groups_slug_key on public.groups (slug);
create index if not exists groups_owner_user_id_idx on public.groups (owner_user_id);
create index if not exists groups_visibility_idx on public.groups (visibility);

-- Group memberships.
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'mod', 'member')),
  status text not null default 'accepted' check (status in ('pending', 'accepted', 'rejected', 'banned')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members
  add column if not exists role text default 'member';
alter table public.group_members
  add column if not exists status text default 'accepted';
alter table public.group_members
  add column if not exists created_at timestamptz default now();

update public.group_members
set role = coalesce(role, 'member')
where role is null;

update public.group_members
set status = coalesce(status, 'accepted')
where status is null;

alter table public.group_members
  alter column role set not null;
alter table public.group_members
  alter column role set default 'member';
alter table public.group_members
  alter column status set not null;
alter table public.group_members
  alter column status set default 'accepted';
alter table public.group_members
  alter column created_at set not null;
alter table public.group_members
  alter column created_at set default now();

alter table public.group_members
  drop constraint if exists group_members_role_check;
alter table public.group_members
  add constraint group_members_role_check check (role in ('owner', 'mod', 'member'));

alter table public.group_members
  drop constraint if exists group_members_status_check;
alter table public.group_members
  add constraint group_members_status_check check (status in ('pending', 'accepted', 'rejected', 'banned'));

create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists group_members_group_status_idx on public.group_members (group_id, status);

-- Group posts are fully separate from reports.
create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_posts_content_length check (char_length(btrim(content)) >= 1)
);

alter table public.group_posts
  add column if not exists title text;
alter table public.group_posts
  add column if not exists content text;
alter table public.group_posts
  add column if not exists updated_at timestamptz default now();

update public.group_posts
set content = 'Post'
where content is null;

alter table public.group_posts
  alter column content set not null;
alter table public.group_posts
  alter column created_at set not null;
alter table public.group_posts
  alter column created_at set default now();
alter table public.group_posts
  alter column updated_at set not null;
alter table public.group_posts
  alter column updated_at set default now();

alter table public.group_posts
  drop constraint if exists group_posts_content_length;
alter table public.group_posts
  add constraint group_posts_content_length check (char_length(btrim(content)) >= 1);

create index if not exists group_posts_group_id_idx on public.group_posts (group_id);
create index if not exists group_posts_created_at_idx on public.group_posts (created_at desc);

create table if not exists public.group_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.group_posts(id) on delete cascade,
  url text not null,
  type text not null default 'image',
  created_at timestamptz not null default now()
);

create index if not exists group_post_media_post_id_idx on public.group_post_media (post_id);

-- Anonymous group chat identities + messages.
create table if not exists public.group_chat_identities (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  anon_name text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create unique index if not exists group_chat_identities_group_anon_name_key
  on public.group_chat_identities (group_id, anon_name);

create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  anon_name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint group_chat_messages_length check (char_length(btrim(message)) between 1 and 1000)
);

alter table public.group_chat_messages
  add column if not exists anon_name text;

update public.group_chat_messages
set anon_name = 'Neighbor-0000'
where anon_name is null;

alter table public.group_chat_messages
  alter column anon_name set not null;

create index if not exists group_chat_messages_group_created_idx on public.group_chat_messages (group_id, created_at);
create index if not exists group_chat_messages_user_idx on public.group_chat_messages (user_id, created_at desc);

-- Events table hardening.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  location_name text not null,
  address text,
  lat numeric not null,
  lng numeric not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events
  add column if not exists creator_user_id uuid references auth.users(id) on delete cascade;
alter table public.events
  add column if not exists title text;
alter table public.events
  add column if not exists description text;
alter table public.events
  add column if not exists category text;
alter table public.events
  add column if not exists start_at timestamptz;
alter table public.events
  add column if not exists end_at timestamptz;
alter table public.events
  add column if not exists location_name text;
alter table public.events
  add column if not exists address text;
alter table public.events
  add column if not exists lat numeric;
alter table public.events
  add column if not exists lng numeric;
alter table public.events
  add column if not exists status text default 'scheduled';
alter table public.events
  add column if not exists created_at timestamptz default now();
alter table public.events
  add column if not exists updated_at timestamptz default now();

update public.events
set status = 'scheduled'
where status is null;

alter table public.events
  alter column creator_user_id set not null;
alter table public.events
  alter column title set not null;
alter table public.events
  alter column description set not null;
alter table public.events
  alter column category set not null;
alter table public.events
  alter column start_at set not null;
alter table public.events
  alter column location_name set not null;
alter table public.events
  alter column lat set not null;
alter table public.events
  alter column lng set not null;
alter table public.events
  alter column status set not null;
alter table public.events
  alter column status set default 'scheduled';
alter table public.events
  alter column created_at set not null;
alter table public.events
  alter column created_at set default now();
alter table public.events
  alter column updated_at set not null;
alter table public.events
  alter column updated_at set default now();

alter table public.events
  drop constraint if exists events_category_check;
alter table public.events
  add constraint events_category_check check (category in ('meeting', 'protest', 'community', 'roadwork', 'safety', 'other'));

alter table public.events
  drop constraint if exists events_status_check;
alter table public.events
  add constraint events_status_check check (status in ('scheduled', 'canceled', 'moved', 'ended'));

alter table public.events
  drop constraint if exists events_time_range;
alter table public.events
  add constraint events_time_range check (end_at is null or end_at >= start_at);

alter table public.events
  drop constraint if exists events_title_length;
alter table public.events
  add constraint events_title_length check (char_length(btrim(title)) >= 3);

alter table public.events
  drop constraint if exists events_description_length;
alter table public.events
  add constraint events_description_length check (char_length(btrim(description)) >= 10);

create index if not exists events_start_at_idx on public.events (start_at);
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

-- Keep updated_at in sync.
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

drop trigger if exists group_posts_touch_updated_at on public.group_posts;
create trigger group_posts_touch_updated_at
before update on public.group_posts
for each row
execute function public.touch_updated_at();

-- RPCs: required group lifecycle and membership control.
create or replace function public.create_group_atomic(
  p_name text,
  p_description text default null,
  p_visibility text default 'public'
)
returns public.groups
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := 'user';
  v_slug_base text;
  v_slug text;
  v_attempt integer := 0;
  v_group public.groups%rowtype;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  select coalesce(p.role, 'user')
  into v_role
  from public.profiles p
  where p.id = v_uid;

  if p_visibility not in ('public', 'private') then
    raise exception using message = 'Invalid visibility', errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) < 3 then
    raise exception using message = 'Group name must be at least 3 characters', errcode = '22023';
  end if;

  if p_description is not null and char_length(btrim(p_description)) > 300 then
    raise exception using message = 'Description must be 300 characters or fewer', errcode = '22023';
  end if;

  if coalesce(v_role, 'user') not in ('mod', 'admin') and exists (
    select 1 from public.groups g where g.owner_user_id = v_uid
  ) then
    raise exception using message = 'Only one owned group is allowed for this account', errcode = '23514';
  end if;

  v_slug_base := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug_base := trim(both '-' from v_slug_base);
  if char_length(v_slug_base) < 2 then
    v_slug_base := 'group';
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 10 then
      raise exception using message = 'Failed to generate unique slug', errcode = '23505';
    end if;

    v_slug := v_slug_base || '-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6);

    begin
      insert into public.groups (
        owner_user_id,
        name,
        slug,
        description,
        visibility
      )
      values (
        v_uid,
        btrim(p_name),
        v_slug,
        nullif(btrim(coalesce(p_description, '')), ''),
        p_visibility
      )
      returning * into v_group;

      exit;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_group.id, v_uid, 'owner', 'accepted')
  on conflict (group_id, user_id) do update
  set role = 'owner', status = 'accepted';

  return v_group;
end;
$$;

revoke all on function public.create_group_atomic(text, text, text) from public;
grant execute on function public.create_group_atomic(text, text, text) to authenticated;

-- Backward-compatible overload used by existing code paths.
create or replace function public.create_group_atomic(
  p_name text,
  p_description text,
  p_visibility text,
  p_city text
)
returns public.groups
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return public.create_group_atomic(p_name, p_description, p_visibility);
end;
$$;

revoke all on function public.create_group_atomic(text, text, text, text) from public;
grant execute on function public.create_group_atomic(text, text, text, text) to authenticated;

create or replace function public.request_follow_group(p_group_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_visibility text;
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

  v_target_status := case when v_visibility = 'public' then 'accepted' else 'pending' end;

  insert into public.group_members (group_id, user_id, role, status)
  values (p_group_id, v_uid, 'member', v_target_status)
  on conflict (group_id, user_id)
  do update
  set status = case
    when public.group_members.role = 'owner' then 'accepted'
    when public.group_members.status = 'banned' then 'banned'
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

revoke all on function public.request_follow_group(uuid) from public;
grant execute on function public.request_follow_group(uuid) to authenticated;

-- Backward-compatible alias.
create or replace function public.request_to_join_group(p_group_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.request_follow_group(p_group_id);
end;
$$;

revoke all on function public.request_to_join_group(uuid) from public;
grant execute on function public.request_to_join_group(uuid) to authenticated;

create or replace function public.respond_to_group_request(
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

  if not public.is_group_manager(p_group_id, v_uid) then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  if p_decision not in ('accept', 'reject') then
    raise exception using message = 'Invalid decision', errcode = '22023';
  end if;

  v_status := case when p_decision = 'accept' then 'accepted' else 'rejected' end;

  insert into public.group_members (group_id, user_id, role, status)
  values (p_group_id, p_user_id, 'member', v_status)
  on conflict (group_id, user_id)
  do update
  set status = case
    when public.group_members.role = 'owner' then 'accepted'
    when public.group_members.status = 'banned' then 'banned'
    else excluded.status
  end
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.respond_to_group_request(uuid, uuid, text) from public;
grant execute on function public.respond_to_group_request(uuid, uuid, text) to authenticated;

-- Backward-compatible alias.
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
begin
  return public.respond_to_group_request(p_group_id, p_user_id, p_decision);
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

  if not public.is_group_manager(p_group_id, v_uid) then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  update public.groups
  set visibility = p_visibility,
      updated_at = now()
  where id = p_group_id
  returning * into v_group;

  if v_group.id is null then
    raise exception using message = 'Group not found', errcode = 'P0002';
  end if;

  return v_group;
end;
$$;

revoke all on function public.toggle_group_visibility(uuid, text) from public;
grant execute on function public.toggle_group_visibility(uuid, text) to authenticated;

create or replace function public.ensure_group_anon_identity(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_try int := 0;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if not (
    public.is_group_accepted_member(p_group_id, v_uid)
    or public.is_group_manager(p_group_id, v_uid)
    or public.is_global_mod_or_admin(v_uid)
  ) then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  select gci.anon_name
  into v_name
  from public.group_chat_identities gci
  where gci.group_id = p_group_id
    and gci.user_id = v_uid;

  if v_name is not null then
    return v_name;
  end if;

  loop
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception using message = 'Unable to allocate anonymous identity', errcode = '23505';
    end if;

    v_name := 'Neighbor-' || lpad((floor(random() * 10000)::int)::text, 4, '0');

    begin
      insert into public.group_chat_identities (group_id, user_id, anon_name)
      values (p_group_id, v_uid, v_name);
      return v_name;
    exception
      when unique_violation then
        continue;
    end;
  end loop;
end;
$$;

revoke all on function public.ensure_group_anon_identity(uuid) from public;
grant execute on function public.ensure_group_anon_identity(uuid) to authenticated;

create or replace function public.delete_group_atomic(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int := 0;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if not public.is_group_manager(p_group_id, v_uid) then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  delete from public.groups
  where id = p_group_id;

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
  group by e.id;
$$;

revoke all on function public.get_event_rsvp_summary(uuid[]) from public;
grant execute on function public.get_event_rsvp_summary(uuid[]) to anon, authenticated;

-- RLS policies.
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_posts enable row level security;
alter table public.group_post_media enable row level security;
alter table public.group_chat_identities enable row level security;
alter table public.group_chat_messages enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

-- groups
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

drop policy if exists "groups_update_owner_or_staff" on public.groups;
create policy "groups_update_owner_or_staff"
on public.groups
for update
to authenticated
using (public.is_group_manager(id, auth.uid()))
with check (public.is_group_manager(id, auth.uid()));

drop policy if exists "groups_delete_owner_or_staff" on public.groups;
create policy "groups_delete_owner_or_staff"
on public.groups
for delete
to authenticated
using (public.is_group_manager(id, auth.uid()));

-- group_members
drop policy if exists "group_members_select_scoped" on public.group_members;
create policy "group_members_select_scoped"
on public.group_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_group_manager(group_id, auth.uid())
  or (status = 'accepted' and public.is_group_accepted_member(group_id, auth.uid()))
);

drop policy if exists "group_members_insert_denied" on public.group_members;
create policy "group_members_insert_denied"
on public.group_members
for insert
to authenticated
with check (false);

drop policy if exists "group_members_update_manager_only" on public.group_members;
create policy "group_members_update_manager_only"
on public.group_members
for update
to authenticated
using (public.is_group_manager(group_id, auth.uid()))
with check (public.is_group_manager(group_id, auth.uid()));

drop policy if exists "group_members_delete_rules" on public.group_members;
create policy "group_members_delete_rules"
on public.group_members
for delete
to authenticated
using (
  (
    public.is_group_manager(group_id, auth.uid())
    and role <> 'owner'
  )
  or (
    user_id = auth.uid()
    and role <> 'owner'
    and status in ('accepted', 'pending')
  )
);

-- group_posts
drop policy if exists "group_posts_select_accepted_or_manager" on public.group_posts;
create policy "group_posts_select_accepted_or_manager"
on public.group_posts
for select
to authenticated
using (
  public.is_group_accepted_member(group_id, auth.uid())
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "group_posts_insert_accepted_or_manager" on public.group_posts;
create policy "group_posts_insert_accepted_or_manager"
on public.group_posts
for insert
to authenticated
with check (
  author_user_id = auth.uid()
  and (
    public.is_group_accepted_member(group_id, auth.uid())
    or public.is_group_manager(group_id, auth.uid())
    or public.is_global_mod_or_admin(auth.uid())
  )
);

drop policy if exists "group_posts_update_author_or_manager" on public.group_posts;
create policy "group_posts_update_author_or_manager"
on public.group_posts
for update
to authenticated
using (
  author_user_id = auth.uid()
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
)
with check (
  author_user_id = auth.uid()
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "group_posts_delete_author_or_manager" on public.group_posts;
create policy "group_posts_delete_author_or_manager"
on public.group_posts
for delete
to authenticated
using (
  author_user_id = auth.uid()
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

-- group_post_media
drop policy if exists "group_post_media_select_scoped" on public.group_post_media;
create policy "group_post_media_select_scoped"
on public.group_post_media
for select
to authenticated
using (
  exists (
    select 1
    from public.group_posts gp
    where gp.id = post_id
      and (
        public.is_group_accepted_member(gp.group_id, auth.uid())
        or public.is_group_manager(gp.group_id, auth.uid())
        or public.is_global_mod_or_admin(auth.uid())
      )
  )
);

drop policy if exists "group_post_media_insert_scoped" on public.group_post_media;
create policy "group_post_media_insert_scoped"
on public.group_post_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.group_posts gp
    where gp.id = post_id
      and (
        gp.author_user_id = auth.uid()
        or public.is_group_manager(gp.group_id, auth.uid())
        or public.is_global_mod_or_admin(auth.uid())
      )
  )
);

drop policy if exists "group_post_media_delete_scoped" on public.group_post_media;
create policy "group_post_media_delete_scoped"
on public.group_post_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.group_posts gp
    where gp.id = post_id
      and (
        gp.author_user_id = auth.uid()
        or public.is_group_manager(gp.group_id, auth.uid())
        or public.is_global_mod_or_admin(auth.uid())
      )
  )
);

-- group_chat_identities
drop policy if exists "group_chat_identities_select_scoped" on public.group_chat_identities;
create policy "group_chat_identities_select_scoped"
on public.group_chat_identities
for select
to authenticated
using (
  (user_id = auth.uid() and public.is_group_accepted_member(group_id, auth.uid()))
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "group_chat_identities_insert_self" on public.group_chat_identities;
create policy "group_chat_identities_insert_self"
on public.group_chat_identities
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    public.is_group_accepted_member(group_id, auth.uid())
    or public.is_group_manager(group_id, auth.uid())
    or public.is_global_mod_or_admin(auth.uid())
  )
);

drop policy if exists "group_chat_identities_delete_scoped" on public.group_chat_identities;
create policy "group_chat_identities_delete_scoped"
on public.group_chat_identities
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

-- group_chat_messages
drop policy if exists "group_chat_messages_select_member_or_staff" on public.group_chat_messages;
create policy "group_chat_messages_select_member_or_staff"
on public.group_chat_messages
for select
to authenticated
using (
  public.is_group_accepted_member(group_id, auth.uid())
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "group_chat_messages_insert_member_or_staff" on public.group_chat_messages;
create policy "group_chat_messages_insert_member_or_staff"
on public.group_chat_messages
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    public.is_group_accepted_member(group_id, auth.uid())
    or public.is_group_manager(group_id, auth.uid())
    or public.is_global_mod_or_admin(auth.uid())
  )
  and exists (
    select 1
    from public.group_chat_identities gci
    where gci.group_id = group_chat_messages.group_id
      and gci.user_id = group_chat_messages.user_id
      and gci.anon_name = group_chat_messages.anon_name
  )
);

drop policy if exists "group_chat_messages_delete_owner_or_staff" on public.group_chat_messages;
create policy "group_chat_messages_delete_owner_or_staff"
on public.group_chat_messages
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

-- events
drop policy if exists "events_select_public" on public.events;
create policy "events_select_public"
on public.events
for select
using (true);

drop policy if exists "events_insert_authenticated" on public.events;
create policy "events_insert_authenticated"
on public.events
for insert
to authenticated
with check (creator_user_id = auth.uid());

drop policy if exists "events_update_owner_or_staff" on public.events;
create policy "events_update_owner_or_staff"
on public.events
for update
to authenticated
using (
  creator_user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
)
with check (
  creator_user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "events_delete_owner_or_staff" on public.events;
create policy "events_delete_owner_or_staff"
on public.events
for delete
to authenticated
using (
  creator_user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

-- event_rsvps
drop policy if exists "event_rsvps_select_own_or_staff" on public.event_rsvps;
create policy "event_rsvps_select_own_or_staff"
on public.event_rsvps
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "event_rsvps_insert_own_or_staff" on public.event_rsvps;
create policy "event_rsvps_insert_own_or_staff"
on public.event_rsvps
for insert
to authenticated
with check (
  (user_id = auth.uid() or public.is_global_mod_or_admin(auth.uid()))
  and exists (
    select 1
    from public.events e
    where e.id = event_id
  )
);

drop policy if exists "event_rsvps_update_own_or_staff" on public.event_rsvps;
create policy "event_rsvps_update_own_or_staff"
on public.event_rsvps
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
)
with check (
  user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "event_rsvps_delete_own_or_staff" on public.event_rsvps;
create policy "event_rsvps_delete_own_or_staff"
on public.event_rsvps
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

-- Realtime support for anonymous group chat.
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
