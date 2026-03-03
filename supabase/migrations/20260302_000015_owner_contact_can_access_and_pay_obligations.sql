create or replace function public.is_owner_contact_for_property(property_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.property_contacts pc
    join public.profiles pr on pr.user_id = user_id
    where pc.property_id = property_id
      and pc.contact_type = 'owner'
      and pc.email is not null
      and pr.email is not null
      and lower(trim(pc.email)) = lower(trim(pr.email))
      and (pc.start_date is null or pc.start_date <= current_date)
      and (pc.end_date is null or pc.end_date >= current_date)
  );
$$;

grant execute on function public.is_owner_contact_for_property(uuid, uuid) to authenticated;

drop policy if exists "payment_obligations_select_owner_or_admin" on public.payment_obligations;
create policy "payment_obligations_select_owner_or_admin"
on public.payment_obligations
for select
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.properties p
    where p.id = payment_obligations.independent_object_id
      and p.owner_user_id = auth.uid()
  )
  or public.is_owner_contact_for_property(payment_obligations.independent_object_id, auth.uid())
);

drop policy if exists "payments_select_owner_or_admin" on public.payments;
create policy "payments_select_owner_or_admin"
on public.payments
for select
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.payment_obligations po
    join public.properties p on p.id = po.independent_object_id
    where po.id = payments.payment_obligation_id
      and (
        p.owner_user_id = auth.uid()
        or public.is_owner_contact_for_property(po.independent_object_id, auth.uid())
      )
  )
);

drop policy if exists "payments_insert_owner_or_admin" on public.payments;
create policy "payments_insert_owner_or_admin"
on public.payments
for insert
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.payment_obligations po
    join public.properties p on p.id = po.independent_object_id
    where po.id = payments.payment_obligation_id
      and (
        p.owner_user_id = auth.uid()
        or public.is_owner_contact_for_property(po.independent_object_id, auth.uid())
      )
  )
);

drop policy if exists "payments_update_owner_or_admin" on public.payments;
create policy "payments_update_owner_or_admin"
on public.payments
for update
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.payment_obligations po
    join public.properties p on p.id = po.independent_object_id
    where po.id = payments.payment_obligation_id
      and (
        p.owner_user_id = auth.uid()
        or public.is_owner_contact_for_property(po.independent_object_id, auth.uid())
      )
  )
)
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.payment_obligations po
    join public.properties p on p.id = po.independent_object_id
    where po.id = payments.payment_obligation_id
      and (
        p.owner_user_id = auth.uid()
        or public.is_owner_contact_for_property(po.independent_object_id, auth.uid())
      )
  )
);
