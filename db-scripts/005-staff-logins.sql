-- Run this after 003-seed-users.sql.
-- Lets a signed-in admin list users and add an Admin or a Manager.
-- The new person signs in with username / password. The password stays in Supabase Auth.

create extension if not exists pgcrypto;

create or replace function public.list_staff_users()
returns table (
  id uuid,
  username text,
  name text,
  role user_role
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ) then
    raise exception 'Only an admin can view users.';
  end if;

  return query
    select u.id, u.username, u.name, u.role
    from public.users u
    order by u.name;
end;
$$;

create or replace function public.create_staff_login(
  p_username text,
  p_name text,
  p_role user_role,
  p_password text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_name text := trim(p_name);
  v_email text;
  v_auth_id uuid;
  v_row_id uuid;
begin
  if not exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and role = 'Admin'
  ) then
    raise exception 'Only an admin can add a user.';
  end if;

  if v_username !~ '^[a-z][a-z0-9]{2,19}$' then
    raise exception 'Username must start with a letter and use 3 to 20 letters or numbers.';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Enter a name up to 40 characters.';
  end if;
  if p_role is distinct from 'Admin'::user_role and p_role is distinct from 'Manager'::user_role then
    raise exception 'Choose Admin or Manager.';
  end if;
  if char_length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;

  v_email := v_username || '@salon.local';

  if exists (select 1 from public.users where username = v_username)
     or exists (select 1 from auth.users where email = v_email) then
    raise exception 'That username is already used.';
  end if;

  v_auth_id := gen_random_uuid();
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_auth_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_auth_id,
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email),
    'email',
    v_auth_id::text,
    now(),
    now(),
    now()
  );

  insert into public.users (username, password_hash, name, role, auth_user_id)
  values (v_username, 'managed-by-supabase-auth', v_name, p_role, v_auth_id)
  returning id into v_row_id;

  return jsonb_build_object(
    'id', v_row_id,
    'username', v_username,
    'name', v_name,
    'role', p_role
  );
end;
$$;

revoke all on function public.list_staff_users() from public;
revoke all on function public.create_staff_login(text, text, user_role, text) from public;
grant execute on function public.list_staff_users() to authenticated;
grant execute on function public.create_staff_login(text, text, user_role, text) to authenticated;
