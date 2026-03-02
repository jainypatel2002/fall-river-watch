set search_path = public, extensions;

alter table public.events
  add column if not exists street text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists place_id text,
  add column if not exists formatted_address text;

update public.events
set formatted_address = address
where formatted_address is null
  and address is not null;

create index if not exists events_city_state_idx on public.events (city, state);
