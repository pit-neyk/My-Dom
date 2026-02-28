create type public.property_contact_type as enum ('owner', 'tenant', 'user', 'representative');

create table if not exists public.property_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  contact_type public.property_contact_type not null,
  first_name text not null,
  middle_name text,
  family_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_property_contacts_property_id on public.property_contacts(property_id);

create trigger trg_property_contacts_updated_at
before update on public.property_contacts
for each row execute function public.set_updated_at();

alter table public.property_contacts enable row level security;

create policy "property_contacts_select_authenticated"
on public.property_contacts
for select
using (auth.role() = 'authenticated');

create policy "property_contacts_admin_manage"
on public.property_contacts
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
