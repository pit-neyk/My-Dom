drop policy if exists "profiles_select_own_or_admin" on public.profiles;

create policy "profiles_select_authenticated"
on public.profiles
for select
using (auth.role() = 'authenticated');
