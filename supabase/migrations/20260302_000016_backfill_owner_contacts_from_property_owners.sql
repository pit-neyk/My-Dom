with owner_candidates as (
  select
    p.id as property_id,
    'owner'::public.property_contact_type as contact_type,
    case
      when nullif(trim(coalesce(pr.full_name, '')), '') is not null then split_part(trim(pr.full_name), ' ', 1)
      when nullif(trim(coalesce(pr.email, '')), '') is not null then split_part(trim(pr.email), '@', 1)
      else 'Owner'
    end as first_name,
    nullif(trim(regexp_replace(coalesce(pr.full_name, ''), '^\\S+\\s*', '')), '') as family_name,
    nullif(trim(pr.email), '') as email,
    nullif(trim(pr.phone), '') as phone
  from public.properties p
  join public.profiles pr on pr.user_id = p.owner_user_id
  where p.owner_user_id is not null
)
insert into public.property_contacts (
  property_id,
  contact_type,
  first_name,
  family_name,
  email,
  phone
)
select
  oc.property_id,
  oc.contact_type,
  oc.first_name,
  oc.family_name,
  oc.email,
  oc.phone
from owner_candidates oc
where not exists (
  select 1
  from public.property_contacts pc
  where pc.property_id = oc.property_id
    and pc.contact_type = 'owner'
    and (
      (
        pc.email is not null
        and oc.email is not null
        and lower(trim(pc.email)) = lower(trim(oc.email))
      )
      or (
        lower(trim(coalesce(pc.first_name, ''))) = lower(trim(coalesce(oc.first_name, '')))
        and lower(trim(coalesce(pc.family_name, ''))) = lower(trim(coalesce(oc.family_name, '')))
      )
    )
);
