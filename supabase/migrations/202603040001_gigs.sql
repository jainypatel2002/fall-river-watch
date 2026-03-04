set search_path = public, extensions;

create extension if not exists pgcrypto with schema public;

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

-- Shared touch trigger helper.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Shared staff helper.
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

-- Core gigs table.
create table if not exists public.gigs (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  description text not null,
  pay_type text not null,
  pay_amount numeric,
  currency text not null default 'USD',
  is_remote boolean not null default false,
  location_name text not null,
  street text,
  city text not null default 'Fall River',
  state text not null default 'MA',
  zip text,
  lat numeric,
  lng numeric,
  schedule_type text not null,
  start_at timestamptz,
  duration_minutes int,
  people_needed int not null default 1,
  tools_required boolean not null default false,
  tools_list text,
  status text not null default 'open',
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gigs
  add column if not exists creator_user_id uuid references auth.users(id) on delete cascade;
alter table public.gigs
  add column if not exists title text;
alter table public.gigs
  add column if not exists category text;
alter table public.gigs
  add column if not exists description text;
alter table public.gigs
  add column if not exists pay_type text;
alter table public.gigs
  add column if not exists pay_amount numeric;
alter table public.gigs
  add column if not exists currency text default 'USD';
alter table public.gigs
  add column if not exists is_remote boolean default false;
alter table public.gigs
  add column if not exists location_name text;
alter table public.gigs
  add column if not exists street text;
alter table public.gigs
  add column if not exists city text default 'Fall River';
alter table public.gigs
  add column if not exists state text default 'MA';
alter table public.gigs
  add column if not exists zip text;
alter table public.gigs
  add column if not exists lat numeric;
alter table public.gigs
  add column if not exists lng numeric;
alter table public.gigs
  add column if not exists schedule_type text;
alter table public.gigs
  add column if not exists start_at timestamptz;
alter table public.gigs
  add column if not exists duration_minutes int;
alter table public.gigs
  add column if not exists people_needed int default 1;
alter table public.gigs
  add column if not exists tools_required boolean default false;
alter table public.gigs
  add column if not exists tools_list text;
alter table public.gigs
  add column if not exists status text default 'open';
alter table public.gigs
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;
alter table public.gigs
  add column if not exists created_at timestamptz default now();
alter table public.gigs
  add column if not exists updated_at timestamptz default now();

update public.gigs
set
  city = coalesce(city, 'Fall River'),
  state = coalesce(state, 'MA'),
  currency = coalesce(currency, 'USD'),
  status = coalesce(status, 'open'),
  is_remote = coalesce(is_remote, false),
  tools_required = coalesce(tools_required, false),
  people_needed = coalesce(people_needed, 1),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  city is null
  or state is null
  or currency is null
  or status is null
  or is_remote is null
  or tools_required is null
  or people_needed is null
  or created_at is null
  or updated_at is null;

alter table public.gigs
  alter column creator_user_id set not null;
alter table public.gigs
  alter column title set not null;
alter table public.gigs
  alter column category set not null;
alter table public.gigs
  alter column description set not null;
alter table public.gigs
  alter column pay_type set not null;
alter table public.gigs
  alter column currency set default 'USD';
alter table public.gigs
  alter column currency set not null;
alter table public.gigs
  alter column is_remote set default false;
alter table public.gigs
  alter column is_remote set not null;
alter table public.gigs
  alter column location_name set not null;
alter table public.gigs
  alter column city set default 'Fall River';
alter table public.gigs
  alter column city set not null;
alter table public.gigs
  alter column state set default 'MA';
alter table public.gigs
  alter column state set not null;
alter table public.gigs
  alter column schedule_type set not null;
alter table public.gigs
  alter column people_needed set default 1;
alter table public.gigs
  alter column people_needed set not null;
alter table public.gigs
  alter column tools_required set default false;
alter table public.gigs
  alter column tools_required set not null;
alter table public.gigs
  alter column status set default 'open';
alter table public.gigs
  alter column status set not null;
alter table public.gigs
  alter column created_at set default now();
alter table public.gigs
  alter column created_at set not null;
alter table public.gigs
  alter column updated_at set default now();
alter table public.gigs
  alter column updated_at set not null;

alter table public.gigs
  drop constraint if exists gigs_title_length;
alter table public.gigs
  add constraint gigs_title_length check (char_length(btrim(title)) >= 3);

alter table public.gigs
  drop constraint if exists gigs_category_check;
alter table public.gigs
  add constraint gigs_category_check check (
    category in ('moving', 'yard_work', 'cleaning', 'handyman', 'delivery', 'pet_care', 'tech_help', 'other')
  );

alter table public.gigs
  drop constraint if exists gigs_description_length;
alter table public.gigs
  add constraint gigs_description_length check (char_length(btrim(description)) >= 10);

alter table public.gigs
  drop constraint if exists gigs_pay_type_check;
alter table public.gigs
  add constraint gigs_pay_type_check check (pay_type in ('fixed', 'hourly', 'free'));

alter table public.gigs
  drop constraint if exists gigs_pay_amount_required;
alter table public.gigs
  add constraint gigs_pay_amount_required check (
    (pay_type = 'free' and pay_amount is null)
    or (pay_type in ('fixed', 'hourly') and pay_amount is not null and pay_amount > 0)
  );

alter table public.gigs
  drop constraint if exists gigs_currency_length;
alter table public.gigs
  add constraint gigs_currency_length check (char_length(btrim(currency)) between 1 and 10);

alter table public.gigs
  drop constraint if exists gigs_location_name_length;
alter table public.gigs
  add constraint gigs_location_name_length check (char_length(btrim(location_name)) >= 2);

alter table public.gigs
  drop constraint if exists gigs_schedule_type_check;
alter table public.gigs
  add constraint gigs_schedule_type_check check (schedule_type in ('asap', 'scheduled', 'flexible'));

alter table public.gigs
  drop constraint if exists gigs_scheduled_requires_start;
alter table public.gigs
  add constraint gigs_scheduled_requires_start check (
    schedule_type <> 'scheduled' or start_at is not null
  );

alter table public.gigs
  drop constraint if exists gigs_duration_check;
alter table public.gigs
  add constraint gigs_duration_check check (duration_minutes is null or duration_minutes > 0);

alter table public.gigs
  drop constraint if exists gigs_people_needed_check;
alter table public.gigs
  add constraint gigs_people_needed_check check (people_needed >= 1 and people_needed <= 100);

alter table public.gigs
  drop constraint if exists gigs_tools_list_length;
alter table public.gigs
  add constraint gigs_tools_list_length check (tools_list is null or char_length(tools_list) <= 600);

alter table public.gigs
  drop constraint if exists gigs_status_check;
alter table public.gigs
  add constraint gigs_status_check check (status in ('open', 'assigned', 'in_progress', 'completed', 'canceled', 'expired'));

alter table public.gigs
  drop constraint if exists gigs_lat_range;
alter table public.gigs
  add constraint gigs_lat_range check (lat is null or (lat >= -90 and lat <= 90));

alter table public.gigs
  drop constraint if exists gigs_lng_range;
alter table public.gigs
  add constraint gigs_lng_range check (lng is null or (lng >= -180 and lng <= 180));

create index if not exists gigs_created_at_idx on public.gigs (created_at desc);
create index if not exists gigs_status_idx on public.gigs (status);
create index if not exists gigs_category_idx on public.gigs (category);
create index if not exists gigs_city_idx on public.gigs (city);
create index if not exists gigs_creator_idx on public.gigs (creator_user_id);
create index if not exists gigs_assigned_idx on public.gigs (assigned_user_id);

-- Gig media.
create table if not exists public.gig_media (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  uploader_user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

alter table public.gig_media
  add column if not exists gig_id uuid references public.gigs(id) on delete cascade;
alter table public.gig_media
  add column if not exists uploader_user_id uuid references auth.users(id) on delete cascade;
alter table public.gig_media
  add column if not exists storage_path text;
alter table public.gig_media
  add column if not exists public_url text;
alter table public.gig_media
  add column if not exists mime_type text;
alter table public.gig_media
  add column if not exists created_at timestamptz default now();

update public.gig_media
set created_at = coalesce(created_at, now())
where created_at is null;

alter table public.gig_media
  alter column gig_id set not null;
alter table public.gig_media
  alter column uploader_user_id set not null;
alter table public.gig_media
  alter column storage_path set not null;
alter table public.gig_media
  alter column public_url set not null;
alter table public.gig_media
  alter column mime_type set not null;
alter table public.gig_media
  alter column created_at set not null;
alter table public.gig_media
  alter column created_at set default now();

alter table public.gig_media
  drop constraint if exists gig_media_mime_length;
alter table public.gig_media
  add constraint gig_media_mime_length check (char_length(btrim(mime_type)) between 3 and 100);

create index if not exists gig_media_gig_id_idx on public.gig_media (gig_id);

-- Applications.
create table if not exists public.gig_applications (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  offered_pay_amount numeric,
  availability text,
  has_tools boolean not null default false,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.gig_applications
  add column if not exists gig_id uuid references public.gigs(id) on delete cascade;
alter table public.gig_applications
  add column if not exists applicant_user_id uuid references auth.users(id) on delete cascade;
alter table public.gig_applications
  add column if not exists message text;
alter table public.gig_applications
  add column if not exists offered_pay_amount numeric;
alter table public.gig_applications
  add column if not exists availability text;
alter table public.gig_applications
  add column if not exists has_tools boolean default false;
alter table public.gig_applications
  add column if not exists status text default 'pending';
alter table public.gig_applications
  add column if not exists created_at timestamptz default now();

update public.gig_applications
set
  has_tools = coalesce(has_tools, false),
  status = coalesce(status, 'pending'),
  created_at = coalesce(created_at, now())
where has_tools is null or status is null or created_at is null;

alter table public.gig_applications
  alter column gig_id set not null;
alter table public.gig_applications
  alter column applicant_user_id set not null;
alter table public.gig_applications
  alter column message set not null;
alter table public.gig_applications
  alter column has_tools set not null;
alter table public.gig_applications
  alter column has_tools set default false;
alter table public.gig_applications
  alter column status set not null;
alter table public.gig_applications
  alter column status set default 'pending';
alter table public.gig_applications
  alter column created_at set not null;
alter table public.gig_applications
  alter column created_at set default now();

alter table public.gig_applications
  drop constraint if exists gig_applications_status_check;
alter table public.gig_applications
  add constraint gig_applications_status_check check (status in ('pending', 'accepted', 'declined', 'withdrawn'));

alter table public.gig_applications
  drop constraint if exists gig_applications_message_length;
alter table public.gig_applications
  add constraint gig_applications_message_length check (char_length(btrim(message)) >= 1);

create unique index if not exists gig_applications_gig_id_applicant_user_id_key
  on public.gig_applications (gig_id, applicant_user_id);

create index if not exists gig_applications_gig_id_idx
  on public.gig_applications (gig_id, created_at desc);

create index if not exists gig_applications_applicant_idx
  on public.gig_applications (applicant_user_id, created_at desc);

-- Chat threads.
create table if not exists public.gig_chat_threads (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.gig_chat_threads
  add column if not exists gig_id uuid references public.gigs(id) on delete cascade;
alter table public.gig_chat_threads
  add column if not exists creator_user_id uuid references auth.users(id) on delete cascade;
alter table public.gig_chat_threads
  add column if not exists worker_user_id uuid references auth.users(id) on delete cascade;
alter table public.gig_chat_threads
  add column if not exists created_at timestamptz default now();

update public.gig_chat_threads
set created_at = coalesce(created_at, now())
where created_at is null;

alter table public.gig_chat_threads
  alter column gig_id set not null;
alter table public.gig_chat_threads
  alter column creator_user_id set not null;
alter table public.gig_chat_threads
  alter column worker_user_id set not null;
alter table public.gig_chat_threads
  alter column created_at set not null;
alter table public.gig_chat_threads
  alter column created_at set default now();

create unique index if not exists gig_chat_threads_gig_id_worker_user_id_key
  on public.gig_chat_threads (gig_id, worker_user_id);

create index if not exists gig_chat_threads_gig_id_idx
  on public.gig_chat_threads (gig_id);

-- Chat messages.
create table if not exists public.gig_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.gig_chat_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.gig_chat_messages
  add column if not exists thread_id uuid references public.gig_chat_threads(id) on delete cascade;
alter table public.gig_chat_messages
  add column if not exists sender_user_id uuid references auth.users(id) on delete cascade;
alter table public.gig_chat_messages
  add column if not exists message text;
alter table public.gig_chat_messages
  add column if not exists created_at timestamptz default now();

update public.gig_chat_messages
set created_at = coalesce(created_at, now())
where created_at is null;

alter table public.gig_chat_messages
  alter column thread_id set not null;
alter table public.gig_chat_messages
  alter column sender_user_id set not null;
alter table public.gig_chat_messages
  alter column message set not null;
alter table public.gig_chat_messages
  alter column created_at set not null;
alter table public.gig_chat_messages
  alter column created_at set default now();

alter table public.gig_chat_messages
  drop constraint if exists gig_chat_messages_length;
alter table public.gig_chat_messages
  add constraint gig_chat_messages_length check (char_length(btrim(message)) between 1 and 1000);

create index if not exists gig_chat_messages_thread_created_idx
  on public.gig_chat_messages (thread_id, created_at);

create index if not exists gig_chat_messages_sender_idx
  on public.gig_chat_messages (sender_user_id, created_at desc);

-- Reviews.
create table if not exists public.gig_reviews (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewee_user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null,
  comment text,
  created_at timestamptz not null default now()
);

alter table public.gig_reviews
  add column if not exists gig_id uuid references public.gigs(id) on delete cascade;
alter table public.gig_reviews
  add column if not exists reviewer_user_id uuid references auth.users(id) on delete cascade;
alter table public.gig_reviews
  add column if not exists reviewee_user_id uuid references auth.users(id) on delete cascade;
alter table public.gig_reviews
  add column if not exists rating int;
alter table public.gig_reviews
  add column if not exists comment text;
alter table public.gig_reviews
  add column if not exists created_at timestamptz default now();

update public.gig_reviews
set created_at = coalesce(created_at, now())
where created_at is null;

alter table public.gig_reviews
  alter column gig_id set not null;
alter table public.gig_reviews
  alter column reviewer_user_id set not null;
alter table public.gig_reviews
  alter column reviewee_user_id set not null;
alter table public.gig_reviews
  alter column rating set not null;
alter table public.gig_reviews
  alter column created_at set not null;
alter table public.gig_reviews
  alter column created_at set default now();

alter table public.gig_reviews
  drop constraint if exists gig_reviews_rating_check;
alter table public.gig_reviews
  add constraint gig_reviews_rating_check check (rating in (-1, 1));

alter table public.gig_reviews
  drop constraint if exists gig_reviews_comment_length;
alter table public.gig_reviews
  add constraint gig_reviews_comment_length check (comment is null or char_length(comment) <= 200);

alter table public.gig_reviews
  drop constraint if exists gig_reviews_reviewer_reviewee_check;
alter table public.gig_reviews
  add constraint gig_reviews_reviewer_reviewee_check check (reviewer_user_id <> reviewee_user_id);

create unique index if not exists gig_reviews_gig_id_reviewer_user_id_key
  on public.gig_reviews (gig_id, reviewer_user_id);

create index if not exists gig_reviews_reviewee_idx
  on public.gig_reviews (reviewee_user_id, created_at desc);

-- Safety flags.
create table if not exists public.gig_flags (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table public.gig_flags
  add column if not exists gig_id uuid references public.gigs(id) on delete cascade;
alter table public.gig_flags
  add column if not exists reporter_user_id uuid references auth.users(id) on delete cascade;
alter table public.gig_flags
  add column if not exists reason text;
alter table public.gig_flags
  add column if not exists details text;
alter table public.gig_flags
  add column if not exists created_at timestamptz default now();

update public.gig_flags
set created_at = coalesce(created_at, now())
where created_at is null;

alter table public.gig_flags
  alter column gig_id set not null;
alter table public.gig_flags
  alter column reporter_user_id set not null;
alter table public.gig_flags
  alter column reason set not null;
alter table public.gig_flags
  alter column created_at set not null;
alter table public.gig_flags
  alter column created_at set default now();

alter table public.gig_flags
  drop constraint if exists gig_flags_reason_check;
alter table public.gig_flags
  add constraint gig_flags_reason_check check (reason in ('spam', 'scam', 'unsafe', 'harassment', 'other'));

alter table public.gig_flags
  drop constraint if exists gig_flags_details_length;
alter table public.gig_flags
  add constraint gig_flags_details_length check (details is null or char_length(details) <= 400);

create index if not exists gig_flags_gig_id_idx
  on public.gig_flags (gig_id, created_at desc);

-- Trigger for updated_at.
drop trigger if exists gigs_touch_updated_at on public.gigs;
create trigger gigs_touch_updated_at
before update on public.gigs
for each row
execute function public.touch_updated_at();

-- Gig helper checks.
create or replace function public.is_gig_participant(p_gig_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_uid is not null
    and (
      exists (
        select 1
        from public.gigs g
        where g.id = p_gig_id
          and (g.creator_user_id = p_uid or g.assigned_user_id = p_uid)
      )
      or exists (
        select 1
        from public.gig_applications ga
        where ga.gig_id = p_gig_id
          and ga.applicant_user_id = p_uid
          and ga.status = 'accepted'
      )
      or public.is_global_mod_or_admin(p_uid)
    );
$$;

revoke all on function public.is_gig_participant(uuid, uuid) from public;
grant execute on function public.is_gig_participant(uuid, uuid) to anon, authenticated;

create or replace function public.can_view_gig(p_gig public.gigs)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_gig.status = 'open'
    or (
      auth.uid() is not null
      and public.is_gig_participant(p_gig.id, auth.uid())
    );
$$;

revoke all on function public.can_view_gig(public.gigs) from public;
grant execute on function public.can_view_gig(public.gigs) to anon, authenticated;

create or replace function public.parse_gig_id_from_media_path(p_path text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts text[] := storage.foldername(p_path);
begin
  if p_path is null then
    return null;
  end if;

  if coalesce(array_length(v_parts, 1), 0) < 2 then
    return null;
  end if;

  if v_parts[1] <> 'gigs' then
    return null;
  end if;

  if v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return v_parts[2]::uuid;
end;
$$;

revoke all on function public.parse_gig_id_from_media_path(text) from public;
grant execute on function public.parse_gig_id_from_media_path(text) to anon, authenticated;

create or replace function public.can_access_gig_media_path(p_path text, p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gig_id uuid := public.parse_gig_id_from_media_path(p_path);
begin
  if p_uid is null or v_gig_id is null then
    return false;
  end if;

  return public.is_gig_participant(v_gig_id, p_uid) or public.is_global_mod_or_admin(p_uid);
end;
$$;

revoke all on function public.can_access_gig_media_path(text, uuid) from public;
grant execute on function public.can_access_gig_media_path(text, uuid) to anon, authenticated;

create or replace function public.can_upload_gig_media_path(p_path text, p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gig_id uuid := public.parse_gig_id_from_media_path(p_path);
begin
  if p_uid is null or v_gig_id is null then
    return false;
  end if;

  return public.is_global_mod_or_admin(p_uid)
    or exists (
      select 1
      from public.gigs g
      where g.id = v_gig_id
        and g.creator_user_id = p_uid
    );
end;
$$;

revoke all on function public.can_upload_gig_media_path(text, uuid) from public;
grant execute on function public.can_upload_gig_media_path(text, uuid) to authenticated;

create or replace function public.can_manage_gig_media_path(p_path text, p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gig_id uuid := public.parse_gig_id_from_media_path(p_path);
begin
  if p_uid is null or v_gig_id is null then
    return false;
  end if;

  return public.is_global_mod_or_admin(p_uid)
    or exists (
      select 1
      from public.gigs g
      where g.id = v_gig_id
        and g.creator_user_id = p_uid
    );
end;
$$;

revoke all on function public.can_manage_gig_media_path(text, uuid) from public;
grant execute on function public.can_manage_gig_media_path(text, uuid) to authenticated;

-- RPC: apply to gig.
create or replace function public.apply_to_gig(
  p_gig_id uuid,
  p_message text,
  p_offered_pay numeric,
  p_availability text,
  p_has_tools boolean
)
returns public.gig_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_gig public.gigs%rowtype;
  v_application public.gig_applications%rowtype;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if p_message is null or char_length(btrim(p_message)) < 1 then
    raise exception using message = 'Application message is required', errcode = '22023';
  end if;

  select g.*
  into v_gig
  from public.gigs g
  where g.id = p_gig_id
  for update;

  if not found then
    raise exception using message = 'Gig not found', errcode = 'P0002';
  end if;

  if v_gig.creator_user_id = v_uid then
    raise exception using message = 'Gig creators cannot apply to their own gig', errcode = '42501';
  end if;

  if v_gig.status <> 'open' then
    raise exception using message = 'Gig is no longer open for applications', errcode = '22023';
  end if;

  insert into public.gig_applications (
    gig_id,
    applicant_user_id,
    message,
    offered_pay_amount,
    availability,
    has_tools,
    status
  )
  values (
    p_gig_id,
    v_uid,
    btrim(p_message),
    p_offered_pay,
    nullif(btrim(p_availability), ''),
    coalesce(p_has_tools, false),
    'pending'
  )
  on conflict (gig_id, applicant_user_id)
  do update
  set
    message = excluded.message,
    offered_pay_amount = excluded.offered_pay_amount,
    availability = excluded.availability,
    has_tools = excluded.has_tools,
    status = 'pending',
    created_at = now()
  returning * into v_application;

  return v_application;
end;
$$;

revoke all on function public.apply_to_gig(uuid, text, numeric, text, boolean) from public;
grant execute on function public.apply_to_gig(uuid, text, numeric, text, boolean) to authenticated;

-- RPC: respond to application (accept/decline + optional thread creation).
create or replace function public.respond_to_application(
  p_application_id uuid,
  p_decision text
)
returns table (
  thread_id uuid,
  gig_id uuid,
  assigned_user_id uuid,
  gig_status text,
  application_id uuid,
  application_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_staff boolean := false;
  v_gig public.gigs%rowtype;
  v_application public.gig_applications%rowtype;
  v_thread_id uuid := null;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if p_decision not in ('accept', 'decline') then
    raise exception using message = 'Invalid decision', errcode = '22023';
  end if;

  select ga.*
  into v_application
  from public.gig_applications ga
  where ga.id = p_application_id
  for update;

  if not found then
    raise exception using message = 'Application not found', errcode = 'P0002';
  end if;

  select g.*
  into v_gig
  from public.gigs g
  where g.id = v_application.gig_id
  for update;

  if not found then
    raise exception using message = 'Gig not found', errcode = 'P0002';
  end if;

  v_is_staff := public.is_global_mod_or_admin(v_uid);

  if not v_is_staff and v_gig.creator_user_id <> v_uid then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  if v_application.status <> 'pending' then
    raise exception using message = 'Only pending applications can be updated', errcode = '22023';
  end if;

  if p_decision = 'decline' then
    update public.gig_applications
    set status = 'declined'
    where id = v_application.id
    returning * into v_application;

    return query
    select
      null::uuid,
      v_gig.id,
      v_gig.assigned_user_id,
      v_gig.status,
      v_application.id,
      v_application.status;

    return;
  end if;

  update public.gig_applications
  set status = 'accepted'
  where id = v_application.id
  returning * into v_application;

  update public.gig_applications
  set status = 'declined'
  where gig_id = v_application.gig_id
    and id <> v_application.id
    and status = 'pending';

  update public.gigs
  set
    assigned_user_id = v_application.applicant_user_id,
    status = 'assigned',
    updated_at = now()
  where id = v_gig.id
  returning * into v_gig;

  insert into public.gig_chat_threads (gig_id, creator_user_id, worker_user_id)
  values (v_gig.id, v_gig.creator_user_id, v_application.applicant_user_id)
  on conflict (gig_id, worker_user_id)
  do update
  set creator_user_id = excluded.creator_user_id
  returning id into v_thread_id;

  return query
  select
    v_thread_id,
    v_gig.id,
    v_gig.assigned_user_id,
    v_gig.status,
    v_application.id,
    v_application.status;
end;
$$;

revoke all on function public.respond_to_application(uuid, text) from public;
grant execute on function public.respond_to_application(uuid, text) to authenticated;

-- RPC: safe status transitions.
create or replace function public.update_gig_status(
  p_gig_id uuid,
  p_status text
)
returns public.gigs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_staff boolean := false;
  v_gig public.gigs%rowtype;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if p_status not in ('open', 'assigned', 'in_progress', 'completed', 'canceled', 'expired') then
    raise exception using message = 'Invalid status', errcode = '22023';
  end if;

  select g.*
  into v_gig
  from public.gigs g
  where g.id = p_gig_id
  for update;

  if not found then
    raise exception using message = 'Gig not found', errcode = 'P0002';
  end if;

  v_is_staff := public.is_global_mod_or_admin(v_uid);

  if not v_is_staff and v_gig.creator_user_id <> v_uid then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  if p_status = v_gig.status then
    return v_gig;
  end if;

  if v_gig.status = 'open' and p_status in ('assigned', 'canceled') then
    null;
  elsif v_gig.status = 'assigned' and p_status in ('in_progress', 'canceled') then
    null;
  elsif v_gig.status = 'in_progress' and p_status in ('completed', 'canceled') then
    null;
  else
    raise exception using message = 'Invalid status transition', errcode = '22023';
  end if;

  if p_status = 'assigned' and v_gig.assigned_user_id is null then
    raise exception using message = 'Cannot mark assigned without an accepted worker', errcode = '22023';
  end if;

  update public.gigs
  set
    status = p_status,
    updated_at = now()
  where id = v_gig.id
  returning * into v_gig;

  return v_gig;
end;
$$;

revoke all on function public.update_gig_status(uuid, text) from public;
grant execute on function public.update_gig_status(uuid, text) to authenticated;

-- RPC: participant-gated media path check (server can sign URL after this).
create or replace function public.create_signed_gig_media_url(p_storage_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if not public.can_access_gig_media_path(p_storage_path, v_uid) then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  return p_storage_path;
end;
$$;

revoke all on function public.create_signed_gig_media_url(text) from public;
grant execute on function public.create_signed_gig_media_url(text) to authenticated;

-- RLS.
alter table public.gigs enable row level security;
alter table public.gig_media enable row level security;
alter table public.gig_applications enable row level security;
alter table public.gig_chat_threads enable row level security;
alter table public.gig_chat_messages enable row level security;
alter table public.gig_reviews enable row level security;
alter table public.gig_flags enable row level security;

drop policy if exists "gigs_public_read" on public.gigs;
create policy "gigs_public_read"
on public.gigs
for select
to anon, authenticated
using (true);

drop policy if exists "gigs_insert_self" on public.gigs;
create policy "gigs_insert_self"
on public.gigs
for insert
to authenticated
with check (creator_user_id = auth.uid());

drop policy if exists "gigs_update_creator_or_staff" on public.gigs;
create policy "gigs_update_creator_or_staff"
on public.gigs
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

drop policy if exists "gigs_delete_creator_or_staff" on public.gigs;
create policy "gigs_delete_creator_or_staff"
on public.gigs
for delete
to authenticated
using (
  (
    creator_user_id = auth.uid()
    and status in ('open', 'canceled')
  )
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_media_select_participants" on public.gig_media;
create policy "gig_media_select_participants"
on public.gig_media
for select
to authenticated
using (
  public.is_gig_participant(gig_id, auth.uid())
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_media_insert_creator_or_staff" on public.gig_media;
create policy "gig_media_insert_creator_or_staff"
on public.gig_media
for insert
to authenticated
with check (
  uploader_user_id = auth.uid()
  and (
    exists (
      select 1
      from public.gigs g
      where g.id = gig_id
        and g.creator_user_id = auth.uid()
    )
    or public.is_global_mod_or_admin(auth.uid())
  )
);

drop policy if exists "gig_media_delete_uploader_creator_or_staff" on public.gig_media;
create policy "gig_media_delete_uploader_creator_or_staff"
on public.gig_media
for delete
to authenticated
using (
  uploader_user_id = auth.uid()
  or exists (
    select 1
    from public.gigs g
    where g.id = gig_id
      and g.creator_user_id = auth.uid()
  )
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_applications_select_scoped" on public.gig_applications;
create policy "gig_applications_select_scoped"
on public.gig_applications
for select
to authenticated
using (
  applicant_user_id = auth.uid()
  or exists (
    select 1
    from public.gigs g
    where g.id = gig_id
      and g.creator_user_id = auth.uid()
  )
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_applications_insert_self_open_gig" on public.gig_applications;
create policy "gig_applications_insert_self_open_gig"
on public.gig_applications
for insert
to authenticated
with check (
  applicant_user_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.gigs g
    where g.id = gig_id
      and g.status = 'open'
      and g.creator_user_id <> auth.uid()
  )
);

drop policy if exists "gig_applications_update_with_rules" on public.gig_applications;
create policy "gig_applications_update_with_rules"
on public.gig_applications
for update
to authenticated
using (
  applicant_user_id = auth.uid()
  or exists (
    select 1
    from public.gigs g
    where g.id = gig_id
      and g.creator_user_id = auth.uid()
  )
  or public.is_global_mod_or_admin(auth.uid())
)
with check (
  public.is_global_mod_or_admin(auth.uid())
  or (
    applicant_user_id = auth.uid()
    and status = 'withdrawn'
  )
  or (
    exists (
      select 1
      from public.gigs g
      where g.id = gig_id
        and g.creator_user_id = auth.uid()
    )
    and status in ('pending', 'accepted', 'declined')
  )
);

drop policy if exists "gig_chat_threads_select_participants" on public.gig_chat_threads;
create policy "gig_chat_threads_select_participants"
on public.gig_chat_threads
for select
to authenticated
using (
  creator_user_id = auth.uid()
  or worker_user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_chat_threads_insert_creator_or_staff" on public.gig_chat_threads;
create policy "gig_chat_threads_insert_creator_or_staff"
on public.gig_chat_threads
for insert
to authenticated
with check (
  (
    creator_user_id = auth.uid()
    and exists (
      select 1
      from public.gigs g
      where g.id = gig_id
        and g.creator_user_id = auth.uid()
        and (
          g.assigned_user_id = worker_user_id
          or exists (
            select 1
            from public.gig_applications ga
            where ga.gig_id = g.id
              and ga.applicant_user_id = worker_user_id
              and ga.status = 'accepted'
          )
        )
    )
  )
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_chat_threads_delete_staff_only" on public.gig_chat_threads;
create policy "gig_chat_threads_delete_staff_only"
on public.gig_chat_threads
for delete
to authenticated
using (public.is_global_mod_or_admin(auth.uid()));

drop policy if exists "gig_chat_messages_select_participants" on public.gig_chat_messages;
create policy "gig_chat_messages_select_participants"
on public.gig_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.gig_chat_threads t
    where t.id = thread_id
      and (
        t.creator_user_id = auth.uid()
        or t.worker_user_id = auth.uid()
      )
  )
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_chat_messages_insert_participants" on public.gig_chat_messages;
create policy "gig_chat_messages_insert_participants"
on public.gig_chat_messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and (
    exists (
      select 1
      from public.gig_chat_threads t
      where t.id = thread_id
        and (
          t.creator_user_id = auth.uid()
          or t.worker_user_id = auth.uid()
        )
    )
    or public.is_global_mod_or_admin(auth.uid())
  )
);

drop policy if exists "gig_chat_messages_delete_sender_or_staff" on public.gig_chat_messages;
create policy "gig_chat_messages_delete_sender_or_staff"
on public.gig_chat_messages
for delete
to authenticated
using (
  sender_user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_reviews_public_read" on public.gig_reviews;
create policy "gig_reviews_public_read"
on public.gig_reviews
for select
to anon, authenticated
using (true);

drop policy if exists "gig_reviews_insert_completed_participants" on public.gig_reviews;
create policy "gig_reviews_insert_completed_participants"
on public.gig_reviews
for insert
to authenticated
with check (
  reviewer_user_id = auth.uid()
  and reviewer_user_id <> reviewee_user_id
  and exists (
    select 1
    from public.gigs g
    where g.id = gig_id
      and g.status = 'completed'
      and (
        (g.creator_user_id = auth.uid() and g.assigned_user_id = reviewee_user_id)
        or (g.assigned_user_id = auth.uid() and g.creator_user_id = reviewee_user_id)
        or public.is_global_mod_or_admin(auth.uid())
      )
  )
);

drop policy if exists "gig_reviews_update_reviewer_or_staff" on public.gig_reviews;
create policy "gig_reviews_update_reviewer_or_staff"
on public.gig_reviews
for update
to authenticated
using (
  reviewer_user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
)
with check (
  reviewer_user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_reviews_delete_reviewer_or_staff" on public.gig_reviews;
create policy "gig_reviews_delete_reviewer_or_staff"
on public.gig_reviews
for delete
to authenticated
using (
  reviewer_user_id = auth.uid()
  or public.is_global_mod_or_admin(auth.uid())
);

drop policy if exists "gig_flags_insert_self" on public.gig_flags;
create policy "gig_flags_insert_self"
on public.gig_flags
for insert
to authenticated
with check (reporter_user_id = auth.uid());

drop policy if exists "gig_flags_staff_read" on public.gig_flags;
create policy "gig_flags_staff_read"
on public.gig_flags
for select
to authenticated
using (public.is_global_mod_or_admin(auth.uid()));

-- Private storage for gig media.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gig-media',
  'gig-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gig_media_authenticated_read" on storage.objects;
create policy "gig_media_authenticated_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'gig-media'
  and public.can_access_gig_media_path(name, auth.uid())
);

drop policy if exists "gig_media_authenticated_upload" on storage.objects;
create policy "gig_media_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'gig-media'
  and owner = auth.uid()
  and public.can_upload_gig_media_path(name, auth.uid())
);

drop policy if exists "gig_media_owner_or_creator_delete" on storage.objects;
create policy "gig_media_owner_or_creator_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'gig-media'
  and (
    owner = auth.uid()
    or public.can_manage_gig_media_path(name, auth.uid())
  )
);

-- Realtime support for gig chat.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gig_chat_messages'
  ) then
    alter publication supabase_realtime add table public.gig_chat_messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';
