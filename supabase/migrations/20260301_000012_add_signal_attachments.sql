create table if not exists public.discussion_attachments (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_discussion_attachments_discussion_id
  on public.discussion_attachments(discussion_id);

alter table public.discussion_attachments enable row level security;

drop policy if exists "discussion_attachments_select_authenticated" on public.discussion_attachments;
create policy "discussion_attachments_select_authenticated"
on public.discussion_attachments
for select
using (auth.role() = 'authenticated');

drop policy if exists "discussion_attachments_insert_owner_or_admin" on public.discussion_attachments;
create policy "discussion_attachments_insert_owner_or_admin"
on public.discussion_attachments
for insert
with check (
  auth.role() = 'authenticated'
  and (
    uploaded_by = auth.uid()
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "discussion_attachments_delete_owner_or_admin" on public.discussion_attachments;
create policy "discussion_attachments_delete_owner_or_admin"
on public.discussion_attachments
for delete
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.discussions d
    where d.id = discussion_attachments.discussion_id
      and d.created_by = auth.uid()
  )
);
