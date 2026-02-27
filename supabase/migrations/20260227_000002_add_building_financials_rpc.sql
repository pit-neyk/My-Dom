-- Returns the total collected (sum of paid obligations) and total due (sum of unpaid obligations)
-- across ALL independent objects in the building.
-- Runs as security definer so any authenticated user can retrieve building-wide totals
-- without having direct SELECT access to every row.

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
        left join public.payments p on p.payment_obligation_id = po.id
        where p.id is null or p.status = 'not paid'
      ),
      0
    )
  );
$$;

grant execute on function public.get_building_financials() to authenticated;
