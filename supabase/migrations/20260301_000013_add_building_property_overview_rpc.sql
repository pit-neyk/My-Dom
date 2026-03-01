create or replace function public.get_building_property_overview()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with property_status as (
    select
      p.id,
      coalesce(
        sum(
          case
            when pr.is_active = true
              and (pay.id is null or pay.status = 'not paid')
            then 1
            else 0
          end
        ),
        0
      ) as pending_count
    from public.properties p
    left join public.payment_obligations po on po.independent_object_id = p.id
    left join public.payment_rates pr on pr.id = po.payment_rate_id
    left join public.payments pay on pay.payment_obligation_id = po.id
    group by p.id
  )
  select json_build_object(
    'total_properties', count(*),
    'with_obligations', count(*) filter (where pending_count > 0),
    'without_obligations', count(*) filter (where pending_count = 0)
  )
  from property_status;
$$;

grant execute on function public.get_building_property_overview() to authenticated;
