set search_path = public, extensions;

-- Compatibility helpers for databases that don't yet have the newer group auth helpers.
create or replace function public.is_global_mod_or_admin(p_uid uuid)
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
      from public.profiles p
      where p.id = p_uid
        and coalesce(to_jsonb(p)->>'role', 'user') in ('mod', 'admin')
    );
$$;

revoke all on function public.is_global_mod_or_admin(uuid) from public;
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

revoke all on function public.is_group_accepted_member(uuid, uuid) from public;
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

revoke all on function public.is_group_manager(uuid, uuid) from public;
grant execute on function public.is_group_manager(uuid, uuid) to anon, authenticated;

-- Compatibility table for anonymous identities in group scope.
create table if not exists public.group_chat_identities (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  anon_name text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_chat_identities
  add column if not exists anon_name text;
alter table public.group_chat_identities
  add column if not exists created_at timestamptz default now();

update public.group_chat_identities
set anon_name = 'Neighbor-' || substring(md5(group_id::text || user_id::text) from 1 for 8)
where anon_name is null or btrim(anon_name) = '';

alter table public.group_chat_identities
  alter column anon_name set not null;
alter table public.group_chat_identities
  alter column created_at set default now();
alter table public.group_chat_identities
  alter column created_at set not null;

create unique index if not exists group_chat_identities_group_anon_name_key
  on public.group_chat_identities (group_id, anon_name);

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

-- Per-user privacy preferences per group.
create table if not exists public.group_user_preferences (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_anonymous boolean not null default false,
  chat_anonymous boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_user_preferences
  add column if not exists post_anonymous boolean default false;
alter table public.group_user_preferences
  add column if not exists chat_anonymous boolean default true;
alter table public.group_user_preferences
  add column if not exists created_at timestamptz default now();
alter table public.group_user_preferences
  add column if not exists updated_at timestamptz default now();

update public.group_user_preferences
set post_anonymous = false
where post_anonymous is null;

update public.group_user_preferences
set chat_anonymous = true
where chat_anonymous is null;

alter table public.group_user_preferences
  alter column post_anonymous set default false;
alter table public.group_user_preferences
  alter column post_anonymous set not null;
alter table public.group_user_preferences
  alter column chat_anonymous set default true;
alter table public.group_user_preferences
  alter column chat_anonymous set not null;
alter table public.group_user_preferences
  alter column created_at set default now();
alter table public.group_user_preferences
  alter column created_at set not null;
alter table public.group_user_preferences
  alter column updated_at set default now();
alter table public.group_user_preferences
  alter column updated_at set not null;

create index if not exists group_user_preferences_user_id_idx on public.group_user_preferences (user_id);

drop trigger if exists group_user_preferences_touch_updated_at on public.group_user_preferences;
create trigger group_user_preferences_touch_updated_at
before update on public.group_user_preferences
for each row
execute function public.touch_updated_at();

-- Group posts now support anonymous or non-anonymous identities.
alter table public.group_posts
  add column if not exists is_anonymous boolean default false;
alter table public.group_posts
  add column if not exists anon_name text;

update public.group_posts
set is_anonymous = false
where is_anonymous is null;

alter table public.group_posts
  alter column is_anonymous set default false;
alter table public.group_posts
  alter column is_anonymous set not null;

alter table public.group_posts
  drop constraint if exists group_posts_anonymous_fields;
alter table public.group_posts
  add constraint group_posts_anonymous_fields check (
    (
      is_anonymous = true
      and anon_name is not null
      and char_length(btrim(anon_name)) between 1 and 80
    )
    or (is_anonymous = false and anon_name is null)
  );

-- Group chat messages can now be anonymous or non-anonymous.
alter table public.group_chat_messages
  add column if not exists anon_name text;
alter table public.group_chat_messages
  add column if not exists is_anonymous boolean default true;

update public.group_chat_messages
set anon_name = 'Neighbor-0000'
where anon_name is null or btrim(anon_name) = '';

update public.group_chat_messages
set is_anonymous = true
where is_anonymous is null;

alter table public.group_chat_messages
  alter column anon_name set not null;
alter table public.group_chat_messages
  alter column is_anonymous set default true;
alter table public.group_chat_messages
  alter column is_anonymous set not null;

alter table public.group_chat_messages
  drop constraint if exists group_chat_messages_anon_name_length;
alter table public.group_chat_messages
  add constraint group_chat_messages_anon_name_length check (char_length(btrim(anon_name)) >= 1);

-- Helper to safely derive a public, non-email display name.
create or replace function public.safe_profile_display_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(
        nullif(btrim(to_jsonb(p)->>'display_name'), ''),
        nullif(btrim(to_jsonb(p)->>'username'), ''),
        nullif(btrim(to_jsonb(p)->>'full_name'), '')
      )
      from public.profiles p
      where p.id = p_uid
      limit 1
    ),
    'Member-' || right(replace(p_uid::text, '-', ''), 4)
  );
$$;

revoke all on function public.safe_profile_display_name(uuid) from public;
grant execute on function public.safe_profile_display_name(uuid) to authenticated;

-- RLS updates.
alter table public.group_chat_identities enable row level security;
alter table public.group_user_preferences enable row level security;

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

drop policy if exists "group_user_preferences_select_self_or_staff" on public.group_user_preferences;
create policy "group_user_preferences_select_self_or_staff"
on public.group_user_preferences
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_group_manager(group_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "group_user_preferences_insert_self" on public.group_user_preferences;
create policy "group_user_preferences_insert_self"
on public.group_user_preferences
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

drop policy if exists "group_user_preferences_update_self" on public.group_user_preferences;
create policy "group_user_preferences_update_self"
on public.group_user_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    public.is_group_accepted_member(group_id, auth.uid())
    or public.is_group_manager(group_id, auth.uid())
    or public.is_global_mod_or_admin(auth.uid())
  )
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
  and (
    (is_anonymous = false and anon_name is null)
    or (
      is_anonymous = true
      and anon_name is not null
      and exists (
        select 1
        from public.group_chat_identities gci
        where gci.group_id = group_posts.group_id
          and gci.user_id = auth.uid()
          and gci.anon_name = group_posts.anon_name
      )
    )
  )
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
  and (
    (
      is_anonymous = true
      and exists (
        select 1
        from public.group_chat_identities gci
        where gci.group_id = group_chat_messages.group_id
          and gci.user_id = group_chat_messages.user_id
          and gci.anon_name = group_chat_messages.anon_name
      )
    )
    or (
      is_anonymous = false
      and group_chat_messages.anon_name = public.safe_profile_display_name(auth.uid())
    )
  )
);
