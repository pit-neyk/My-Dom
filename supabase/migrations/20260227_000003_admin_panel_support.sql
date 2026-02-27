create table if not exists public.mass_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content_html text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null unique,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_mass_messages_updated_at
before update on public.mass_messages
for each row execute function public.set_updated_at();

create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

alter table public.mass_messages enable row level security;
alter table public.documents enable row level security;

create policy "mass_messages_select_authenticated"
on public.mass_messages
for select
using (auth.role() = 'authenticated');

create policy "mass_messages_admin_manage"
on public.mass_messages
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "documents_select_authenticated"
on public.documents
for select
using (auth.role() = 'authenticated');

create policy "documents_admin_manage"
on public.documents
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace function public.handle_new_user_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_defaults on auth.users;
create trigger on_auth_user_created_defaults
after insert on auth.users
for each row execute function public.handle_new_user_defaults();

insert into storage.buckets (id, name, public)
values ('building-documents', 'building-documents', false)
on conflict (id) do nothing;

drop policy if exists "building_documents_read_authenticated" on storage.objects;
create policy "building_documents_read_authenticated"
on storage.objects
for select
using (bucket_id = 'building-documents' and auth.role() = 'authenticated');

drop policy if exists "building_documents_insert_admin" on storage.objects;
create policy "building_documents_insert_admin"
on storage.objects
for insert
with check (bucket_id = 'building-documents' and public.is_admin(auth.uid()));

drop policy if exists "building_documents_update_admin" on storage.objects;
create policy "building_documents_update_admin"
on storage.objects
for update
using (bucket_id = 'building-documents' and public.is_admin(auth.uid()))
with check (bucket_id = 'building-documents' and public.is_admin(auth.uid()));

drop policy if exists "building_documents_delete_admin" on storage.objects;
create policy "building_documents_delete_admin"
on storage.objects
for delete
using (bucket_id = 'building-documents' and public.is_admin(auth.uid()));
