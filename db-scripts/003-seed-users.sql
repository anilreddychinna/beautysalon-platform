-- Creates the default staff logins. Run this after 002-row-level-security.sql.
-- Sign in on the app as admin / admin123 or manager / manager123.

create extension if not exists pgcrypto;

create or replace function public.seed_staff_login(
  p_username text,
  p_name text,
  p_role user_role,
  p_password text
) returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text := p_username || '@salon.local';
  v_id uuid;
begin
  select id into v_id from auth.users where email = v_email;

  if v_id is null then
    v_id := gen_random_uuid();
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
      v_id,
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
  else
    update auth.users
    set encrypted_password = crypt(p_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_id;
  end if;

  if not exists (
    select 1 from auth.identities where user_id = v_id and provider = 'email'
  ) then
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
      v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email),
      'email',
      v_id::text,
      now(),
      now(),
      now()
    );
  end if;

  insert into public.users (username, password_hash, name, role, auth_user_id)
  values (p_username, 'managed-by-supabase-auth', p_name, p_role, v_id)
  on conflict (username) do update
    set name = excluded.name,
        role = excluded.role,
        auth_user_id = excluded.auth_user_id;
end;
$$;

select public.seed_staff_login('admin', 'Admin', 'Admin', 'admin123');
select public.seed_staff_login('manager', 'Ravi', 'Manager', 'manager123');

drop function public.seed_staff_login(text, text, user_role, text);
