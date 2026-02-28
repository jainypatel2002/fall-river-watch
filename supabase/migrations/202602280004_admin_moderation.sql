-- Enhance comment RLS to support admin/mod moderation

-- Drop ownership-only policies
drop policy if exists "incident_comments_update_owner" on public.incident_comments;
drop policy if exists "incident_comments_delete_owner" on public.incident_comments;

-- Add updated policies incorporating current_user_role
create policy "incident_comments_update_owner_or_staff"
on public.incident_comments
for update
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
)
with check (
  user_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

create policy "incident_comments_delete_owner_or_staff"
on public.incident_comments
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() in ('admin', 'mod')
);

-- Notify schema reload
notify pgrst, 'reload schema';
