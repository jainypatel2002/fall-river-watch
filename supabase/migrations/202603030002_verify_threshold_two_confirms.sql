set search_path = public, extensions;

create or replace function public.recompute_report_status(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  verify_confirm_threshold int := 2;
  dispute_threshold int := 3;
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

  if dispute_count >= dispute_threshold then
    update public.reports set status = 'disputed' where id = p_report_id;
  elsif confirm_count >= verify_confirm_threshold and dispute_count < dispute_threshold then
    update public.reports set status = 'verified' where id = p_report_id;
  elsif is_expired and current_status <> 'verified' then
    update public.reports set status = 'expired' where id = p_report_id;
  else
    update public.reports set status = 'unverified' where id = p_report_id;
  end if;
end;
$$;

do $$
declare
  report_row record;
begin
  for report_row in select id from public.reports loop
    perform public.recompute_report_status(report_row.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
