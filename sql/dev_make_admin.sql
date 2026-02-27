-- Replace with your auth user UUID.
update public.profiles
set role = 'admin'
where id = '00000000-0000-0000-0000-000000000000';
