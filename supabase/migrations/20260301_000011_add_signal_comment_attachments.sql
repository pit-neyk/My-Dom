create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_message_attachments_message_id
  on public.message_attachments(message_id);

drop policy if exists "discussions_insert_authenticated" on public.discussions;
create policy "discussions_insert_authenticated"
on public.discussions
for insert
with check (
  auth.role() = 'authenticated'
  and (created_by = auth.uid() or public.is_admin(auth.uid()))
);

alter table public.message_attachments enable row level security;

drop policy if exists "message_attachments_select_authenticated" on public.message_attachments;
create policy "message_attachments_select_authenticated"
on public.message_attachments
for select
using (auth.role() = 'authenticated');

drop policy if exists "message_attachments_insert_owner_or_admin" on public.message_attachments;
create policy "message_attachments_insert_owner_or_admin"
on public.message_attachments
for insert
with check (
  auth.role() = 'authenticated'
  and (
    uploaded_by = auth.uid()
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "message_attachments_delete_owner_or_admin" on public.message_attachments;
create policy "message_attachments_delete_owner_or_admin"
on public.message_attachments
for delete
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.messages m
    where m.id = message_attachments.message_id
      and m.owner_user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('signal-comment-attachments', 'signal-comment-attachments', false)
on conflict (id) do nothing;

drop policy if exists "signal_comment_attachments_read_authenticated" on storage.objects;
create policy "signal_comment_attachments_read_authenticated"
on storage.objects
for select
using (
  bucket_id = 'signal-comment-attachments'
  and auth.role() = 'authenticated'
);

drop policy if exists "signal_comment_attachments_insert_authenticated" on storage.objects;
create policy "signal_comment_attachments_insert_authenticated"
on storage.objects
for insert
with check (
  bucket_id = 'signal-comment-attachments'
  and auth.role() = 'authenticated'
);

drop policy if exists "signal_comment_attachments_update_owner_or_admin" on storage.objects;
create policy "signal_comment_attachments_update_owner_or_admin"
on storage.objects
for update
using (
  bucket_id = 'signal-comment-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
  )
)
with check (
  bucket_id = 'signal-comment-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "signal_comment_attachments_delete_owner_or_admin" on storage.objects;
create policy "signal_comment_attachments_delete_owner_or_admin"
on storage.objects
for delete
using (
  bucket_id = 'signal-comment-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
  )
);
