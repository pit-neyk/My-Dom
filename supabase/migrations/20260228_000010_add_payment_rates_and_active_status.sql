create table if not exists public.payment_rates (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month smallint not null check (month between 1 and 12),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, month)
);

insert into public.payment_rates (year, month)
select distinct po.year, po.month
from public.payment_obligations po
on conflict (year, month) do nothing;

alter table public.payment_obligations
add column if not exists payment_rate_id uuid;

update public.payment_obligations po
set payment_rate_id = pr.id
from public.payment_rates pr
where pr.year = po.year
  and pr.month = po.month
  and po.payment_rate_id is null;

alter table public.payment_obligations
alter column payment_rate_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_obligations_payment_rate_id_fkey'
  ) then
    alter table public.payment_obligations
      add constraint payment_obligations_payment_rate_id_fkey
      foreign key (payment_rate_id)
      references public.payment_rates(id)
      on delete cascade;
  end if;
end
$$;

create unique index if not exists idx_payment_obligations_rate_property
on public.payment_obligations(payment_rate_id, independent_object_id);

create index if not exists idx_payment_obligations_payment_rate_id
on public.payment_obligations(payment_rate_id);

drop trigger if exists trg_payment_rates_updated_at on public.payment_rates;
create trigger trg_payment_rates_updated_at
before update on public.payment_rates
for each row execute function public.set_updated_at();

create or replace function public.prevent_deactivate_paid_rate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_active = true and new.is_active = false then
    if exists (
      select 1
      from public.payment_obligations po
      join public.payments p on p.payment_obligation_id = po.id
      where po.payment_rate_id = new.id
        and p.status = 'paid'
    ) then
      raise exception 'Cannot deactivate a rate with paid obligations.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payment_rates_prevent_deactivate_paid on public.payment_rates;
create trigger trg_payment_rates_prevent_deactivate_paid
before update on public.payment_rates
for each row execute function public.prevent_deactivate_paid_rate();

alter table public.payment_rates enable row level security;

drop policy if exists "payment_rates_select_authenticated" on public.payment_rates;
create policy "payment_rates_select_authenticated"
on public.payment_rates
for select
using (auth.role() = 'authenticated');

drop policy if exists "payment_rates_admin_manage" on public.payment_rates;
create policy "payment_rates_admin_manage"
on public.payment_rates
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace function public.get_building_financials()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total_collected',
    coalesce(
      (
        select sum(po.rate)
        from public.payment_obligations po
        join public.payments p on p.payment_obligation_id = po.id
        where p.status = 'paid'
      ),
      0
    ),
    'total_due',
    coalesce(
      (
        select sum(po.rate)
        from public.payment_obligations po
        join public.payment_rates pr on pr.id = po.payment_rate_id
        left join public.payments p on p.payment_obligation_id = po.id
        where pr.is_active = true
          and (p.id is null or p.status = 'not paid')
      ),
      0
    )
  );
$$;

grant execute on function public.get_building_financials() to authenticated;
