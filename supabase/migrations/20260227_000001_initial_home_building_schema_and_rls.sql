create extension if not exists pgcrypto;

create type public.roles as enum ('admin', 'user', 'guest');
create type public.payment_status as enum ('paid', 'not paid');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.roles not null default 'user',
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.independent_objects (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  floor integer not null,
  owner_user_id uuid not null references auth.users(id),
  square_meters numeric(10,2) not null check (square_meters > 0),
  tenants_count integer not null default 0 check (tenants_count >= 0),
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_obligations (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month smallint not null check (month between 1 and 12),
  independent_object_id uuid not null references public.independent_objects(id) on delete cascade,
  rate numeric(12,2) not null check (rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, month, independent_object_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_obligation_id uuid not null unique references public.payment_obligations(id) on delete cascade,
  status public.payment_status not null default 'not paid',
  date date,
  marked_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discussions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description_html text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  content_html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_independent_objects_owner_user_id on public.independent_objects(owner_user_id);
create index idx_payment_obligations_object_id on public.payment_obligations(independent_object_id);
create index idx_payments_obligation_id on public.payments(payment_obligation_id);
create index idx_messages_discussion_id on public.messages(discussion_id);
create index idx_messages_owner_user_id on public.messages(owner_user_id);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_independent_objects_updated_at
before update on public.independent_objects
for each row execute function public.set_updated_at();

create trigger trg_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger trg_payment_obligations_updated_at
before update on public.payment_obligations
for each row execute function public.set_updated_at();

create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger trg_discussions_updated_at
before update on public.discussions
for each row execute function public.set_updated_at();

create trigger trg_messages_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = uid
      and ur.role = 'admin'
  );
$$;

alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.independent_objects enable row level security;
alter table public.events enable row level security;
alter table public.payment_obligations enable row level security;
alter table public.payments enable row level security;
alter table public.discussions enable row level security;
alter table public.messages enable row level security;

create policy "user_roles_select_own_or_admin"
on public.user_roles
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "user_roles_admin_manage"
on public.user_roles
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "profiles_insert_own_or_admin"
on public.profiles
for insert
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "profiles_update_own_or_admin"
on public.profiles
for update
using (auth.uid() = user_id or public.is_admin(auth.uid()))
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "independent_objects_admin_all"
on public.independent_objects
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "independent_objects_select_authenticated"
on public.independent_objects
for select
using (auth.role() = 'authenticated');

create policy "events_admin_manage"
on public.events
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "events_select_authenticated"
on public.events
for select
using (auth.role() = 'authenticated');

create policy "payment_obligations_select_owner_or_admin"
on public.payment_obligations
for select
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.independent_objects io
    where io.id = payment_obligations.independent_object_id
      and io.owner_user_id = auth.uid()
  )
);

create policy "payment_obligations_admin_manage"
on public.payment_obligations
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "payments_select_owner_or_admin"
on public.payments
for select
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.payment_obligations po
    join public.independent_objects io on io.id = po.independent_object_id
    where po.id = payments.payment_obligation_id
      and io.owner_user_id = auth.uid()
  )
);

create policy "payments_insert_owner_or_admin"
on public.payments
for insert
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.payment_obligations po
    join public.independent_objects io on io.id = po.independent_object_id
    where po.id = payments.payment_obligation_id
      and io.owner_user_id = auth.uid()
  )
);

create policy "payments_update_owner_or_admin"
on public.payments
for update
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.payment_obligations po
    join public.independent_objects io on io.id = po.independent_object_id
    where po.id = payments.payment_obligation_id
      and io.owner_user_id = auth.uid()
  )
)
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.payment_obligations po
    join public.independent_objects io on io.id = po.independent_object_id
    where po.id = payments.payment_obligation_id
      and io.owner_user_id = auth.uid()
  )
);

create policy "discussions_select_authenticated"
on public.discussions
for select
using (auth.role() = 'authenticated');

create policy "discussions_insert_authenticated"
on public.discussions
for insert
with check (auth.role() = 'authenticated');

create policy "discussions_update_creator_or_admin"
on public.discussions
for update
using (created_by = auth.uid() or public.is_admin(auth.uid()))
with check (created_by = auth.uid() or public.is_admin(auth.uid()));

create policy "discussions_delete_creator_or_admin"
on public.discussions
for delete
using (created_by = auth.uid() or public.is_admin(auth.uid()));

create policy "messages_select_authenticated"
on public.messages
for select
using (auth.role() = 'authenticated');

create policy "messages_insert_owner_or_admin"
on public.messages
for insert
with check (owner_user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "messages_update_owner_or_admin"
on public.messages
for update
using (owner_user_id = auth.uid() or public.is_admin(auth.uid()))
with check (owner_user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "messages_delete_owner_or_admin"
on public.messages
for delete
using (owner_user_id = auth.uid() or public.is_admin(auth.uid()));