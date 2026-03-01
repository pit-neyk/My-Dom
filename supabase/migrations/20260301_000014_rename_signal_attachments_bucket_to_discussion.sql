insert into storage.buckets (id, name, public)
values ('discussion-comment-attachments', 'discussion-comment-attachments', false)
on conflict (id) do nothing;

drop policy if exists "discussion_comment_attachments_read_authenticated" on storage.objects;
create policy "discussion_comment_attachments_read_authenticated"
on storage.objects
for select
using (
  bucket_id = 'discussion-comment-attachments'
  and auth.role() = 'authenticated'
);

drop policy if exists "discussion_comment_attachments_insert_authenticated" on storage.objects;
create policy "discussion_comment_attachments_insert_authenticated"
on storage.objects
for insert
with check (
  bucket_id = 'discussion-comment-attachments'
  and auth.role() = 'authenticated'
);

drop policy if exists "discussion_comment_attachments_update_owner_or_admin" on storage.objects;
create policy "discussion_comment_attachments_update_owner_or_admin"
on storage.objects
for update
using (
  bucket_id = 'discussion-comment-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
  )
)
with check (
  bucket_id = 'discussion-comment-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "discussion_comment_attachments_delete_owner_or_admin" on storage.objects;
create policy "discussion_comment_attachments_delete_owner_or_admin"
on storage.objects
for delete
using (
  bucket_id = 'discussion-comment-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
  )
);
