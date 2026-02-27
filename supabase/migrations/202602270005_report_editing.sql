set search_path = public, extensions;

-- Ensure reports track updates.
alter table public.reports
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row
execute function public.set_reports_updated_at();

-- Track who uploaded each media item.
alter table public.report_media
  add column if not exists uploader_id uuid references public.profiles(id) on delete cascade;

update public.report_media rm
set uploader_id = r.reporter_id
from public.reports r
where r.id = rm.report_id
  and rm.uploader_id is null;

alter table public.report_media
  alter column uploader_id set not null;

-- Restrict direct report updates to staff only.
drop policy if exists "reports_update_owner_or_staff" on public.reports;
drop policy if exists "reports_update_staff_only" on public.reports;
create policy "reports_update_staff_only"
on public.reports
for update
to authenticated
using (public.current_user_role() in ('admin', 'mod'))
with check (public.current_user_role() in ('admin', 'mod'));

-- Owner/staff-safe content update RPC.
create or replace function public.update_report_content(
  p_report_id uuid,
  p_title text,
  p_description text
)
returns public.reports
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_report public.reports%rowtype;
  v_role text;
  v_title text;
  v_description text;
begin
  if auth.uid() is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  select *
  into v_report
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception using message = 'Report not found', errcode = 'P0002';
  end if;

  v_role := coalesce(public.current_user_role(), 'user');
  if v_report.reporter_id <> auth.uid() and v_role not in ('admin', 'mod') then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  v_description := btrim(coalesce(p_description, ''));

  if char_length(v_description) < 20 then
    raise exception using message = 'Description must be at least 20 characters', errcode = '22023';
  end if;

  if char_length(v_description) > 500 then
    raise exception using message = 'Description must be 500 characters or fewer', errcode = '22023';
  end if;

  if v_title is not null and char_length(v_title) > 120 then
    raise exception using message = 'Title must be 120 characters or fewer', errcode = '22023';
  end if;

  update public.reports
  set
    title = v_title,
    description = v_description,
    updated_at = now()
  where id = v_report.id
  returning * into v_report;

  return v_report;
end;
$$;

revoke all on function public.update_report_content(uuid, text, text) from public;
grant execute on function public.update_report_content(uuid, text, text) to authenticated;

-- Preserve owner/staff resolve behavior without broad direct UPDATE rights.
create or replace function public.resolve_report(p_report_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_report public.reports%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  select *
  into v_report
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception using message = 'Report not found', errcode = 'P0002';
  end if;

  v_role := coalesce(public.current_user_role(), 'user');
  if v_report.reporter_id <> auth.uid() and v_role not in ('admin', 'mod') then
    raise exception using message = 'Forbidden', errcode = '42501';
  end if;

  update public.reports
  set
    status = 'resolved',
    updated_at = now()
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

revoke all on function public.resolve_report(uuid) from public;
grant execute on function public.resolve_report(uuid) to authenticated;

-- Media ownership checks for inserts/deletes.
drop policy if exists "report_media_insert_owner_or_staff" on public.report_media;
create policy "report_media_insert_owner_or_staff"
on public.report_media
for insert
to authenticated
with check (
  uploader_id = auth.uid()
  and (
    public.current_user_role() in ('admin', 'mod')
    or exists (
      select 1
      from public.reports r
      where r.id = report_id
        and r.reporter_id = auth.uid()
    )
  )
);

drop policy if exists "report_media_delete_owner_or_staff" on public.report_media;
create policy "report_media_delete_owner_or_staff"
on public.report_media
for delete
to authenticated
using (
  public.current_user_role() in ('admin', 'mod')
  or (
    uploader_id = auth.uid()
    and exists (
      select 1
      from public.reports r
      where r.id = report_id
        and r.reporter_id = auth.uid()
    )
  )
);

-- Storage object delete support for staff moderation.
drop policy if exists "report_media_owner_delete" on storage.objects;
create policy "report_media_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'report-media'
  and (
    owner = auth.uid()
    or public.current_user_role() in ('admin', 'mod')
  )
);

notify pgrst, 'reload schema';
