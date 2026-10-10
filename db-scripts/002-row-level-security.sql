-- Run this after 001-create-tables.sql.
-- Staff sign in with Supabase Auth. A username "admin" uses the email admin@salon.local.

alter table users add column if not exists auth_user_id uuid unique references auth.users (id);

alter table shops enable row level security;
alter table users enable row level security;
alter table customers enable row level security;
alter table services enable row level security;
alter table staff enable row level security;
alter table bills enable row level security;
alter table bill_lines enable row level security;
alter table day_closes enable row level security;

drop policy if exists staff_all on shops;
drop policy if exists staff_all on customers;
drop policy if exists staff_all on services;
drop policy if exists staff_all on staff;
drop policy if exists staff_all on bills;
drop policy if exists staff_all on bill_lines;
drop policy if exists staff_all on day_closes;
drop policy if exists read_own_user on users;

create policy staff_all on shops for all to authenticated using (true) with check (true);
create policy staff_all on customers for all to authenticated using (true) with check (true);
create policy staff_all on services for all to authenticated using (true) with check (true);
create policy staff_all on staff for all to authenticated using (true) with check (true);
create policy staff_all on bills for all to authenticated using (true) with check (true);
create policy staff_all on bill_lines for all to authenticated using (true) with check (true);
create policy staff_all on day_closes for all to authenticated using (true) with check (true);
create policy read_own_user on users for select to authenticated using (auth_user_id = auth.uid());

revoke all on table users from anon, authenticated;
grant select (id, username, name, role, auth_user_id, created_at) on users to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Default logins are created by 003-seed-users.sql.
