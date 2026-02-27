set search_path = public, extensions;

-- Route report deletion through RPC so auth + cleanup happens in one controlled flow.
drop policy if exists "reports_delete_owner_or_staff" on public.reports;
drop policy if exists "reports_delete_staff_only" on public.reports;

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

  if v_reporter_id <> v_uid and coalesce(v_role, 'user') not in ('admin', 'mod') then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  select coalesce(array_agg(rm.storage_path order by rm.created_at asc), array[]::text[])
  into v_media_paths
  from public.report_media rm
  where rm.report_id = p_report_id;

  -- Flags are polymorphic (not FK-bound to reports), so remove report flags explicitly.
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

notify pgrst, 'reload schema';
