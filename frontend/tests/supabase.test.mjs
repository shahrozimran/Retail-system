import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { NextResponse } from 'next/server.js';
import { supabaseConfig, signIn, signOut, requireSession, databaseError, rpc, supabaseClient } from '../src/lib/supabase.ts';
import { writeSession, clearSession } from '../src/lib/auth-cookies.ts';

const ID='11111111-1111-4111-8111-111111111111';
const user={id:ID,email:'admin@example.invalid',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{}};
const token = suffix => [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:ID,session_id:'22222222-2222-4222-8222-222222222222',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),role:'authenticated'})).toString('base64url'),suffix].join('.');
const ACCESS=token('signature'),NEW_ACCESS=token('newsignature');
const REFRESH='test-refresh-token',NEW_REFRESH='test-new-refresh-token';
const originalFetch=globalThis.fetch;
const calls=[];
process.env.SUPABASE_URL='https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_testonly';
function mock(options={}) {
  calls.length=0;
  globalThis.fetch=async(input,init={})=>{
    const url=String(input);calls.push({url,init});
    if(url.includes('/auth/v1/token')) {
      if(options.badPassword)return Response.json({msg:'Invalid login credentials',error_code:'invalid_credentials'},{status:400});
      const refreshed=url.includes('refresh_token');
      return Response.json({access_token:refreshed?NEW_ACCESS:ACCESS,refresh_token:refreshed?NEW_REFRESH:REFRESH,expires_in:3600,token_type:'bearer',user});
    }
    if(url.includes('/auth/v1/user'))return options.expired?Response.json({msg:'JWT expired',error_code:'bad_jwt'},{status:401}):Response.json(user);
    if(url.includes('/auth/v1/logout'))return new Response(null,{status:204});
    if(url.includes('/rest/v1/rpc/retail_session'))return options.nonAdmin?Response.json({code:'42501',message:'Admin access is required.'},{status:403}):Response.json({success:true,username:user.email,userId:ID});
    if(url.includes('/rest/v1/rpc/retail_read'))return Response.json({success:true,data:[]});
    throw new Error('Unexpected mocked destination');
  };
}
after(()=>{globalThis.fetch=originalFetch;});

test('configuration accepts public keys and rejects secret/service-role or insecure destinations',()=>{
  assert.equal(supabaseConfig().url,'https://test-project.supabase.co');
  const validKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  for(const key of ['sb_secret_testonly','header.'+Buffer.from('{"role":"service_role"}').toString('base64url')+'.signature','']) {
    process.env.SUPABASE_PUBLISHABLE_KEY=key;assert.throws(supabaseConfig);
  }
  process.env.SUPABASE_PUBLISHABLE_KEY=validKey;
  process.env.SUPABASE_URL='https://user:password@test-project.supabase.co';assert.throws(supabaseConfig);
  process.env.SUPABASE_URL='https://test-project.supabase.co';
});

test('SDK email/password sign-in checks database admin status before issuing a session',async()=>{
  mock();const session=await signIn(user.email,'test-only-password');
  assert.equal(session.access_token,ACCESS);
  assert.ok(calls.some(c=>c.url.includes('grant_type=password')));
  assert.ok(calls.some(c=>c.url.includes('retail_session')));
  mock({nonAdmin:true});await assert.rejects(signIn('other@example.invalid','test-only-password'),e=>e.status===403);
  assert.ok(calls.some(c=>c.url.includes('/logout?scope=local')));
  mock({badPassword:true});await assert.rejects(signIn(user.email,'wrong'),e=>e.status===401);
});

test('valid cookies authorize RPCs; expired access refreshes through Supabase Auth',async()=>{
  mock();const request=new Request('https://retail.example/api/proxy/',{headers:{cookie:`retail_access=${ACCESS}; retail_refresh=${REFRESH}`}});
  const existing=await requireSession(request);assert.equal(existing.refreshed,false);
  assert.deepEqual((await rpc(existing.client,'retail_read',{p_action:'customers'})).data,[]);
  mock({expired:true});const refreshed=await requireSession(request);
  assert.equal(refreshed.refreshed,true);assert.equal(refreshed.accessToken,NEW_ACCESS);assert.equal(refreshed.refreshToken,NEW_REFRESH);
  assert.ok(calls.some(c=>c.url.includes('grant_type=refresh_token')));
});

test('native session requires bearer/header tokens; web cookies cannot satisfy it',async()=>{
  mock();
  await assert.rejects(requireSession(new Request('https://retail.example/',{headers:{'x-retail-client':'native',cookie:`retail_access=${ACCESS}; retail_refresh=${REFRESH}`}})),e=>e.status===401);
  const session=await requireSession(new Request('https://retail.example/',{headers:{'x-retail-client':'native',authorization:`Bearer ${ACCESS}`,'x-retail-refresh-token':REFRESH}}));
  assert.equal(session.native,true);assert.equal(session.refreshToken,REFRESH);
});

test('web tokens stay HttpOnly; native refresh tokens use response headers only',()=>{
  const session={accessToken:ACCESS,refreshToken:REFRESH,expiresIn:3600,native:false};
  const response=writeSession(NextResponse.json({success:true}),session);
  const cookies=response.headers.get('set-cookie');
  assert.match(cookies,/HttpOnly/);assert.match(cookies,/SameSite=strict/i);
  assert.equal(response.headers.get('x-retail-refresh-token'),null);
  const native=writeSession(NextResponse.json({success:true}),{...session,native:true});
  assert.equal(native.headers.get('set-cookie'),null);assert.equal(native.headers.get('x-retail-refresh-token'),REFRESH);
  assert.match(clearSession(response).headers.get('set-cookie'),/Max-Age=0/);
});

test('logout uses the current user JWT and local scope without a service-role key',async()=>{
  mock();await signOut(ACCESS);
  const call=calls.find(c=>c.url.includes('/logout?scope=local'));
  assert.ok(call);assert.equal(new Headers(call.init.headers).get('authorization'),`Bearer ${ACCESS}`);
});

test('database errors distinguish atomic rollback from uncertain network failures',async()=>{
  assert.equal(databaseError({code:'23514'}).rolledBack,true);
  assert.equal(databaseError({code:'23503'}).status,409);
  assert.equal(databaseError({code:'42501'}).rolledBack,false);
  assert.equal(databaseError({code:'PGRST000'}).rolledBack,false);
  const stale = databaseError({code:'23505',message:'This order changed in another window. Refresh before editing or deleting it.'});
  assert.equal(stale.rolledBack,true);assert.match(stale.message,/changed in another window/);
  assert.doesNotMatch(databaseError({code:'23505',message:'private internal detail'}).message,/private internal detail/);
  mock();assert.ok(supabaseClient());
});
