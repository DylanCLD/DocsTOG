drop policy if exists "users_select_self_or_admin" on public.users;
drop policy if exists "users_select_auth" on public.users;

create policy "users_select_auth"
on public.users
for select
to authenticated
using (true);
