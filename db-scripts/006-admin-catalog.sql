-- Run this after 005-staff-logins.sql.
-- Managers can still read services and staff for billing.
-- Only an admin can add or change them.

drop policy if exists staff_all on services;
drop policy if exists staff_all on staff;
drop policy if exists services_read on services;
drop policy if exists services_insert on services;
drop policy if exists services_update on services;
drop policy if exists services_delete on services;
drop policy if exists staff_read on staff;
drop policy if exists staff_insert on staff;
drop policy if exists staff_update on staff;
drop policy if exists staff_delete on staff;

create policy services_read on services for select to authenticated using (true);
create policy services_insert on services for insert to authenticated
  with check (exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ));
create policy services_update on services for update to authenticated
  using (exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ))
  with check (exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ));
create policy services_delete on services for delete to authenticated
  using (exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ));

create policy staff_read on staff for select to authenticated using (true);
create policy staff_insert on staff for insert to authenticated
  with check (exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ));
create policy staff_update on staff for update to authenticated
  using (exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ))
  with check (exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ));
create policy staff_delete on staff for delete to authenticated
  using (exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ));
