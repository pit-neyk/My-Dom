alter table public.properties
  add column if not exists property_type text,
  add column if not exists pets_count integer not null default 0 check (pets_count >= 0),
  add column if not exists ideal_parts numeric(10,3);
