set search_path = public, extensions;

-- Ensure profiles has an explicit, constrained role source of truth.
alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'mod', 'admin'));

-- Prevent self role escalation while still allowing staff moderation.
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (
  (id = auth.uid() and coalesce(role, 'user') = 'user')
  or public.current_user_role() in ('admin', 'mod')
);

drop policy if exists "profiles_update_own_or_staff" on public.profiles;
create policy "profiles_update_own_or_staff"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
)
with check (
  (
    id = auth.uid()
    and role = coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'user')
  )
  or public.current_user_role() in ('admin', 'mod')
);

-- Owner or admin can delete incidents/reports.
drop policy if exists "reports_delete_owner_or_staff" on public.reports;
drop policy if exists "reports_delete_owner_or_admin" on public.reports;
create policy "reports_delete_owner_or_admin"
on public.reports
for delete
to authenticated
using (
  reporter_id = auth.uid()
  or public.current_user_role() = 'admin'
);

-- Enforce owner-or-admin semantics in delete RPC as well.
create or replace function public.delete_report(p_report_id uuid)
returns table (
  deleted boolean,
  report_id uuid,
  media_paths text[]
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_reporter_id uuid;
  v_media_paths text[] := array[]::text[];
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  select r.reporter_id
  into v_reporter_id
  from public.reports r
  where r.id = p_report_id
  for update;

  if not found then
    return query
      select false, p_report_id, array[]::text[];
    return;
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_reporter_id <> v_uid and coalesce(v_role, 'user') <> 'admin' then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  select coalesce(array_agg(rm.storage_path order by rm.created_at asc), array[]::text[])
  into v_media_paths
  from public.report_media rm
  where rm.report_id = p_report_id;

  delete from public.flags
  where target_type = 'report'
    and target_id = p_report_id;

  delete from public.reports where id = p_report_id;

  return query
    select true, p_report_id, v_media_paths;
end;
$$;

revoke all on function public.delete_report(uuid) from public;
grant execute on function public.delete_report(uuid) to authenticated;

-- Verification semantics: users can only mutate their own votes; admin can moderate deletes.
alter table public.report_votes
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists report_votes_touch_updated_at on public.report_votes;
create trigger report_votes_touch_updated_at
before update on public.report_votes
for each row
execute function public.touch_updated_at();

drop policy if exists "report_votes_update_self_or_staff" on public.report_votes;
drop policy if exists "report_votes_update_self_only" on public.report_votes;
create policy "report_votes_update_self_only"
on public.report_votes
for update
to authenticated
using (voter_id = auth.uid())
with check (voter_id = auth.uid());

drop policy if exists "report_votes_delete_self_or_staff" on public.report_votes;
drop policy if exists "report_votes_delete_self_or_admin" on public.report_votes;
create policy "report_votes_delete_self_or_admin"
on public.report_votes
for delete
to authenticated
using (
  voter_id = auth.uid()
  or public.current_user_role() = 'admin'
);

-- Optional admin observability for push subscriptions.
drop policy if exists "Admins can view all push subscriptions" on public.push_subscriptions;
create policy "Admins can view all push subscriptions"
on public.push_subscriptions
for select
to authenticated
using (public.current_user_role() = 'admin');

notify pgrst, 'reload schema';
