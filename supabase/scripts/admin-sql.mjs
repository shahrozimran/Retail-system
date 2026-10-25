export function buildAdminSql(email, passwordHash) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid admin email is required.');
  if (!/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(passwordHash)) throw new Error('A bcrypt cost-12 hash is required.');
  const literal = value => "'" + value.replace(/'/g, "''") + "'";
  return `-- PRIVATE: contains the configured account and salted password verifier.
-- Run after 202610260001_retail.sql in the Supabase SQL Editor as postgres.
-- Creates/updates only this account and grants it the single app-admin slot.
begin;
do $$
declare
  v_email text := ${literal(email.trim().toLowerCase())};
  v_password_hash text := ${literal(passwordHash)};
  v_user_id uuid;
begin
  if to_regclass('public.retail_admin') is null then raise exception 'Run the retail schema migration first.'; end if;
  if (select count(*) from auth.users where lower(email)=v_email)>1 then raise exception 'Multiple Auth accounts use this email. Resolve them in Authentication before bootstrapping.'; end if;
  select id into v_user_id from auth.users where lower(email)=v_email;
  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      confirmation_token,recovery_token,email_change_token_new,email_change,
      email_change_token_current,reauthentication_token,phone_change_token,
      raw_app_meta_data,raw_user_meta_data,is_sso_user,is_anonymous,created_at,updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',v_user_id,'authenticated','authenticated',v_email,v_password_hash,now(),
      '','','','','','','',
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,false,false,now(),now()
    );
  else
    update auth.users set encrypted_password=v_password_hash,email_confirmed_at=coalesce(email_confirmed_at,now()),
      confirmation_token='',recovery_token='',email_change_token_new='',email_change='',email_change_token_current='',reauthentication_token='',phone_change_token='',
      raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"provider":"email","providers":["email"]}'::jsonb,updated_at=now()
    where id=v_user_id;
  end if;
  insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
  values(gen_random_uuid(),v_user_id::text,v_user_id,jsonb_build_object('sub',v_user_id::text,'email',v_email,'email_verified',true,'phone_verified',false),'email',now(),now())
  on conflict (provider_id,provider) do update set identity_data=excluded.identity_data,updated_at=excluded.updated_at;
  delete from auth.sessions where user_id=v_user_id;
  insert into public.retail_admin(singleton,user_id,email,active) values(true,v_user_id,v_email,true)
  on conflict(singleton) do update set user_id=excluded.user_id,email=excluded.email,active=true;
end;
$$;
commit;
select 'Admin account configured. Business tables contain no seeded records.' as result;
`;
}
