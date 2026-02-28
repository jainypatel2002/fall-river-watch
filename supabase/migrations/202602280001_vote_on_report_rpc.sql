set search_path = public, extensions;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_votes_report_id_voter_id_key'
      and conrelid = 'public.report_votes'::regclass
  ) then
    alter table public.report_votes
      add constraint report_votes_report_id_voter_id_key unique (report_id, voter_id);
  end if;
end;
$$;

create index if not exists report_votes_report_id_idx on public.report_votes (report_id);

create or replace function public.vote_on_report(
  p_report_id uuid,
  p_vote text
)
returns table (
  confirms_count int,
  disputes_count int,
  user_vote text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_report_id uuid;
  v_confirm_count int := 0;
  v_dispute_count int := 0;
  v_user_vote text := null;
begin
  if v_uid is null then
    raise exception using message = 'Unauthorized', errcode = '42501';
  end if;

  if p_vote not in ('confirm', 'dispute', 'clear') then
    raise exception using message = 'Invalid vote type', errcode = '22023';
  end if;

  select id
  into v_report_id
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    raise exception using message = 'Report not found', errcode = 'P0002';
  end if;

  if p_vote = 'clear' then
    delete from public.report_votes
    where report_id = p_report_id
      and voter_id = v_uid;

    v_user_vote := null;
  else
    insert into public.report_votes (report_id, voter_id, vote_type)
    values (p_report_id, v_uid, p_vote)
    on conflict (report_id, voter_id)
    do update set vote_type = excluded.vote_type;

    v_user_vote := p_vote;
  end if;

  select
    count(*) filter (where vote_type = 'confirm')::int,
    count(*) filter (where vote_type = 'dispute')::int
  into v_confirm_count, v_dispute_count
  from public.report_votes
  where report_id = p_report_id;

  return query
  select v_confirm_count, v_dispute_count, v_user_vote;
end;
$$;

revoke all on function public.vote_on_report(uuid, text) from public;
grant execute on function public.vote_on_report(uuid, text) to authenticated;

notify pgrst, 'reload schema';
