import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const ADMIN='11111111-1111-4111-8111-111111111111', USER='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333', OTHER_SESSION='44444444-4444-4444-8444-444444444444';
let db;
const read = async (action,customer=null) => (await db.query('select public.retail_read($1,$2::uuid) as data',[action,customer])).rows[0].data.data;
const mutate = async payload => (await db.query('select public.retail_mutate($1::jsonb) as result',[JSON.stringify(payload)])).rows[0].result;
const request = payload => ({requestId:randomUUID(),requestedAt:Date.now(),...payload});
const identity = async (id=ADMIN,session=SESSION,role='authenticated') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,role})]);
  await db.exec(`set role ${role}`);
};
before(async()=>{
  db=new PGlite(); await db.waitReady;
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
    insert into auth.users(id,email) values('${ADMIN}','admin@example.invalid'),('${USER}','other@example.invalid');
    insert into auth.sessions(id,user_id) values('${SESSION}','${ADMIN}'),('${OTHER_SESSION}','${USER}');`);
  await db.exec(fs.readFileSync(new URL('../../supabase/migrations/202610260001_retail.sql',import.meta.url),'utf8'));
  await db.query('insert into public.retail_admin(user_id,email) values($1,$2)',[ADMIN,'admin@example.invalid']);
  await identity();
});
after(async()=>{if(db)await db.close();});

test('migration denies anonymous and non-admin access, including direct table and RPC calls',async()=>{
  await identity(USER,OTHER_SESSION);
  assert.equal((await db.query('select * from public.products')).rows.length,0);
  await assert.rejects(read('dashboard'),/Admin access/);
  await assert.rejects(db.query("insert into public.raw_materials(name,stock) values('Forbidden',1)"),/permission denied/);
  await identity(USER,OTHER_SESSION,'anon');
  await assert.rejects(read('dashboard'),/permission denied/);
  await identity();
  assert.equal((await db.query('select public.retail_session() as result')).rows[0].result.success,true);
});

test('fresh migration creates no business entries or sample data',async()=>{
  for(const table of ['products','raw_materials','customers','sales_batches','transactions','finances','customer_ledger','productions','operations','audit_log']) {
    assert.equal((await db.query(`select count(*)::int as count from public.${table}`)).rows[0].count,0);
  }
  assert.equal((await db.query('select balance from public.finance_account')).rows[0].balance,'0.00');
  await identity(USER,OTHER_SESSION,'anon');
  assert.equal((await db.query('select public.retail_health() as result')).rows[0].result.version,1);
  await identity();
});

test('CRUD, decimal materials, zero-price products and API response shapes work',async()=>{
  const raw=(await mutate(request({action:'add_raw_material',name:'Steel',stock:20.5}))).uuid;
  const product=(await mutate(request({action:'add_product',sku:'TEST',name:'Product',category:'Parts',buyPrice:1.2,salePrice:3.4,quantity:10,minStock:0,status:'Active',rawMaterials:[{uuid:raw,name:'Steel',quantity:20.5,requiredPerProduct:0.5}]}))).uuid;
  const customer=(await mutate(request({action:'add_customer',name:'Customer',phone:'+920000000',email:''}))).uuid;
  const dashboard=await read('dashboard');
  const p=dashboard.products.find(p=>p.uuid===product);
  assert.equal(p.potentialQuantity,41); assert.equal(p.quantity,10); assert.equal(p.rawMaterials[0].uuid,raw);
  assert.equal(dashboard.totalInventoryValue,12); assert.equal(dashboard.totalBalance,0);
  assert.equal((await read('customers')).find(c=>c.uuid===customer).balance,0);
});

test('batch posting atomically changes inventory, finances and linked customer ledgers; replay is idempotent',async()=>{
  const product=(await read('products'))[0],customer=(await read('customers'))[0];
  const payload=request({action:'batch_transaction',customerUuid:customer.uuid,buyerName:customer.name,description:'Sale',items:[{productUuid:product.uuid,type:'Out',qtyChange:2,unitPrice:3.4},{productUuid:product.uuid,type:'Out',qtyChange:1,unitPrice:0}]});
  const result=await mutate(payload); assert.equal(result.success,true);
  assert.deepEqual(await mutate(payload),result);
  await assert.rejects(mutate({...payload,description:'Different'}),/different data/);
  const dashboard=await read('dashboard'); assert.equal(dashboard.products[0].quantity,7); assert.equal(dashboard.totalBalance,6.8);
  assert.equal((await read('customers'))[0].balance,6.8);
  assert.equal((await read('customer_ledger',customer.uuid)).length,1);
  const transactions=await read('transactions');assert.equal(transactions.length,2);assert.equal(transactions[0].customerUuid,customer.uuid);
});

test('overselling duplicate lines and invalid later items roll back every earlier write',async()=>{
  const product=(await read('products'))[0];
  const before=await read('dashboard'),transactions=await read('transactions');
  const item={productUuid:product.uuid,type:'Out',qtyChange:4,unitPrice:1};
  await assert.rejects(mutate(request({action:'batch_transaction',items:[item,item]})),/Insufficient stock/);
  await assert.rejects(mutate(request({action:'batch_transaction',items:[{...item,qtyChange:1},{...item,productUuid:randomUUID()}]})),/Product not found/);
  assert.deepEqual(await read('dashboard'),before);assert.deepEqual(await read('transactions'),transactions);
});

test('customer overflow rolls back stock, batches, sales, finance and operation records',async()=>{
  const product=(await read('products'))[0],customer=(await read('customers'))[0];
  await db.exec('reset role');await db.query('update public.customers set current_balance=999999999999 where id=$1',[customer.uuid]);await identity();
  const before=await read('dashboard'),tx=await read('transactions');
  const payload=request({action:'batch_transaction',customerUuid:customer.uuid,items:[{productUuid:product.uuid,type:'Out',qtyChange:1,unitPrice:2}]});
  await assert.rejects(mutate(payload),/check constraint/);
  assert.deepEqual(await read('dashboard'),before);assert.deepEqual(await read('transactions'),tx);
  assert.equal((await db.query('select * from public.operations where request_id=$1',[payload.requestId])).rows.length,0);
  await db.exec('reset role');await db.query('update public.customers set current_balance=6.8 where id=$1',[customer.uuid]);await identity();
});

test('database boundary rejects negative, typed-string, fractional, unknown and stale requests',async()=>{
  const product=(await read('products'))[0];
  const good={action:'transaction',productUuid:product.uuid,type:'Out',qtyChange:1,unitPrice:2};
  for(const change of [{qtyChange:-1},{qtyChange:'1'},{qtyChange:1.5},{unitPrice:-2},{unitPrice:0.001},{type:'unknown'},{injected:true},{requestedAt:0}]) await assert.rejects(mutate(request({...good,...change})));
  await assert.rejects(mutate(request({action:'delete_transaction',transactionId:randomUUID()})),/immutable/);
});

test('production consumes normalized material quantities atomically and forbids duplicate recipes',async()=>{
  const product=(await read('products'))[0],raw=(await read('raw_materials'))[0];
  await mutate(request({action:'process_production',productUuid:product.uuid,qtyProduced:2}));
  assert.equal((await read('products'))[0].quantity,9); assert.equal((await read('raw_materials'))[0].stock,19.5);
  assert.equal((await read('productions'))[0].rawMaterialsUsed[0].qtyUsed,1);
  const bad={action:'update_product',productUuid:product.uuid,sku:product.sku,name:product.name,category:product.category,buyPrice:product.buyPrice,salePrice:product.salePrice,quantity:9,minStock:0,status:'Active',rawMaterials:[{uuid:raw.uuid,requiredPerProduct:1},{uuid:raw.uuid,requiredPerProduct:2}]};
  await assert.rejects(mutate(request(bad)),/unique/);
  assert.equal((await read('products'))[0].rawMaterials[0].requiredPerProduct,0.5);
  const before=await read('dashboard');await assert.rejects(mutate(request({action:'process_production',productUuid:product.uuid,qtyProduced:100})),/Insufficient/);assert.deepEqual(await read('dashboard'),before);
});

test('payments, ledger isolation, immutable history, reference deletes and SKU uniqueness are enforced',async()=>{
  const first=(await read('customers'))[0];
  const second=(await mutate(request({action:'add_customer',name:'Second'}))).uuid;
  await mutate(request({action:'record_customer_payment',customerUuid:second,type:'Receivable',amount:2.5,description:'Second only\nWith a second line'}));
  assert.equal((await read('customer_ledger',second))[0].description,'Second only\nWith a second line');
  assert.notEqual((await read('customer_ledger',first.uuid))[0].description,'Second only');
  await assert.rejects(mutate(request({action:'delete_customer',customerUuid:second})),/balances/);
  const product=(await read('products'))[0];
  await assert.rejects(mutate(request({action:'delete_product',productUuid:product.uuid})),/foreign key/);
  await assert.rejects(mutate(request({action:'add_product',productUuid:product.uuid,sku:product.sku,name:'Duplicate',category:'',buyPrice:0,salePrice:0,quantity:0,minStock:0,status:'Active',rawMaterials:[]})),/unique/);
});

test('revoked sessions and changed account emails fail database authorization',async()=>{
  await identity(ADMIN,randomUUID());await assert.rejects(read('dashboard'),/Admin access/);
  await db.exec('reset role');await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[ADMIN]);await identity();
  await assert.rejects(read('dashboard'),/Admin access/);
  await db.exec('reset role');await db.query('update auth.users set banned_until=null where id=$1',[ADMIN]);
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[SESSION]);await identity();
  await assert.rejects(read('dashboard'),/Admin access/);
  await db.exec('reset role');await db.query('update auth.sessions set not_after=null where id=$1',[SESSION]);
  await identity();await db.exec('reset role');await db.query('update auth.users set email=$1 where id=$2',['changed@example.invalid',ADMIN]);await identity();
  await assert.rejects(read('dashboard'),/Admin access/);
});
