import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import { buildAdminSql } from '../../supabase/scripts/admin-sql.mjs';

test('private bootstrap creates a confirmed bcrypt account and email identity without business rows',async()=>{
  const db=new PGlite(); await db.waitReady;
  try {
    await db.exec(`create schema auth;
      create table auth.users(instance_id uuid,id uuid primary key,aud text,role text,email text unique,encrypted_password text,email_confirmed_at timestamptz,
        confirmation_token text,recovery_token text,email_change_token_new text,email_change text,email_change_token_current text,reauthentication_token text,phone_change_token text,
        raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_sso_user boolean,is_anonymous boolean,created_at timestamptz,updated_at timestamptz);
      create table auth.identities(id uuid primary key,provider_id text,user_id uuid references auth.users(id),identity_data jsonb,provider text,created_at timestamptz,updated_at timestamptz,unique(provider_id,provider));
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
      create table public.retail_admin(singleton boolean primary key,user_id uuid references auth.users(id),email text,active boolean);`);
    const password='test-only-bootstrap-password';
    const sql=buildAdminSql('admin@example.invalid',await bcrypt.hash(password,12));
    assert.ok(!sql.includes(password));
    await db.exec(sql);
    const user=(await db.query('select * from auth.users')).rows[0];
    assert.equal(await bcrypt.compare(password,user.encrypted_password),true);
    assert.ok(user.email_confirmed_at);
    assert.equal((await db.query('select * from auth.identities')).rows[0].provider_id,user.id);
    await db.exec(sql);
    assert.equal((await db.query('select * from auth.users')).rows.length,1);
    assert.equal((await db.query('select * from public.retail_admin')).rows.length,1);
  } finally {await db.close();}
});
