import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { commitTransactionCorrection } from '../src/lib/transaction-correction-server.ts';

const admin=randomUUID(), user=randomUUID(), session=randomUUID(), otherSession=randomUUID();
let db;
const migration=fs.readFileSync(new URL('../../supabase/migrations/202610260002_transaction_corrections.sql',import.meta.url),'utf8');
const request=p=>({requestId:randomUUID(),requestedAt:Date.now(),...p});
const mutate=async p=>(await db.query('select public.retail_mutate($1::jsonb) as r',[JSON.stringify(p)])).rows[0].r;
const read=async (action,customer=null)=>(await db.query('select public.retail_read($1,$2::uuid) as r',[action,customer])).rows[0].r.data;
const identity=async (id=admin,sid=session,role='authenticated')=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:sid,role})]);
  await db.exec(`set role ${role}`);
};
const rows=async(table,where='',params=[])=>(await db.query(`select * from public.${table} ${where}`,params)).rows;
const product=async(name,quantity=100)=>(await mutate(request({action:'add_product',sku:randomUUID(),name,category:'',buyPrice:1,salePrice:10,quantity,minStock:0,status:'Active',rawMaterials:[]}))).uuid;
const customer=async name=>(await mutate(request({action:'add_customer',name}))).uuid;
const post=async(items,c='')=>(await mutate(request({action:'batch_transaction',items,customerUuid:c,buyerName:'Customer',description:'Original order'}))).uuid;
const item=(p,qty=2,price=10,type='Out')=>({productUuid:p,type,qtyChange:qty,unitPrice:price});
const tx=async batch=>(await read('transactions')).filter(t=>t.batchId===batch);
const correction=(action,batch,revision=1,extra={})=>request({action,batchId:batch,expectedRevision:revision,reason:'Correct an entry mistake',...extra});
const balance=async c=>(await read('customers')).find(x=>x.uuid===c).balance;
const stock=async p=>(await read('products')).find(x=>x.uuid===p).quantity;

before(async()=>{
  db=new PGlite();await db.waitReady;
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
    insert into auth.users values('${admin}','admin@example.invalid',null),('${user}','other@example.invalid',null);
    insert into auth.sessions(id,user_id) values('${session}','${admin}'),('${otherSession}','${user}');`);
  await db.exec(fs.readFileSync(new URL('../../supabase/migrations/202610260001_retail.sql',import.meta.url),'utf8'));
  await db.query('insert into public.retail_admin(user_id,email) values($1,$2)',[admin,'admin@example.invalid']);
  await identity();
  // Start with a real v1-style posting before upgrading; it must survive unchanged.
  const p=await product('Existing product');await post([item(p)]);
  await db.exec('reset role');await db.exec(migration);await identity();
});
after(async()=>{await db?.close();});

test('upgrade preserves existing postings, is rerunnable and retains database access controls',async()=>{
  const before=await read('dashboard'),transactions=await read('transactions');
  assert.equal(transactions.length,1);assert.equal(transactions[0].revision,1);
  await db.exec('reset role');await db.exec(migration);await identity();
  assert.deepEqual(await read('dashboard'),before);assert.deepEqual(await read('transactions'),transactions);
  assert.equal((await rows('transaction_changes')).length,0);
  await identity(user,otherSession);
  assert.equal((await rows('transaction_changes')).length,0);
  await assert.rejects(mutate(correction('delete_transaction_batch',transactions[0].batchId)),/Admin access/);
  await assert.rejects(db.query("select retail_private.correct_transaction('{}')"),/permission denied/);
  await assert.rejects(db.query("select retail_private.retail_mutate('{}')"),/permission denied/);
  await assert.rejects(db.exec('delete from public.transactions'),/permission denied/);
  await assert.rejects(db.exec('delete from public.transaction_changes'),/permission denied/);
  await identity(user,otherSession,'anon');
  await assert.rejects(mutate(correction('delete_transaction_batch',transactions[0].batchId)),/permission denied/);
  await identity();
});

test('editing an older sale updates stock, finance, customer balance and later ledger snapshots atomically',async()=>{
  const p=await product('Edit sale'),c=await customer('Edit sale customer');
  const first=await post([item(p,2,100)],c);
  await post([item(p,1,50)],c);
  await mutate(request({action:'record_customer_payment',customerUuid:c,type:'Payable',amount:25,description:'Later payment'}));
  const [original]=await tx(first);
  const payload=correction('update_transaction_batch',first,1,{customerUuid:c,buyerName:'Updated buyer',description:'Updated note',items:[{id:original.id,...item(p,3,110)}]});
  const receipt=await mutate(payload);
  assert.deepEqual(await mutate(payload),receipt);
  assert.equal(receipt.revision,2);assert.equal(await stock(p),96);assert.equal(await balance(c),355);
  const [updated]=await tx(first);assert.equal(updated.id,original.id);assert.equal(updated.date,original.date);assert.equal(updated.total,330);assert.equal(updated.buyerName,'Updated buyer');
  const ledger=await read('customer_ledger',c);
  assert.equal(ledger.find(x=>x.description==='Later payment').balanceSnapshot,355);
  assert.equal(ledger.find(x=>x.amount===50).balanceSnapshot,380);
  const changes=await rows('transaction_changes','where batch_id=$1',[first]);
  assert.equal(changes.length,1);assert.equal(changes[0].before_state.transactions[0].quantity,2);assert.equal(changes[0].after_state.transactions[0].quantity,3);
  const account=Number((await rows('finance_account'))[0].balance);
  const finance=(await rows('finances')).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||Number(a.id)-Number(b.id));
  let running=0;for(const row of finance){running+=Number(row.credit)-Number(row.debit);assert.equal(Number(row.balance_snapshot),running);}
  assert.equal(account,running);
});

test('single-item edits, deletion from a multi-item order and final-item deletion preserve linked balances',async()=>{
  const p=await product('Partial deletion'),c=await customer('Partial customer');
  const batch=await post([item(p,2,10),item(p,1,5)],c);const original=await tx(batch);
  const target=original.find(x=>x.unitPrice===10);
  await mutate(request({action:'update_transaction',transactionId:target.id,expectedRevision:1,reason:'Fix price',...item(p,2,12.25)}));
  assert.equal(await balance(c),29.5);assert.equal((await tx(batch))[0].revision,2);
  await mutate(request({action:'delete_transaction',transactionId:target.id,expectedRevision:2,reason:'Remove duplicate line'}));
  assert.equal(await balance(c),5);assert.equal(await stock(p),99);assert.equal((await tx(batch)).length,1);
  assert.equal((await read('customer_ledger',c))[0].amount,5);
  await mutate(request({action:'delete_transaction',transactionId:(await tx(batch))[0].id,expectedRevision:3,reason:'Cancel remaining line'}));
  assert.equal(await stock(p),100);assert.equal(await balance(c),0);assert.equal((await tx(batch)).length,0);
  assert.equal((await read('customer_ledger',c)).length,0);assert.equal((await rows('sales_batches','where id=$1',[batch])).length,0);
  assert.equal((await rows('transaction_changes','where batch_id=$1',[batch])).length,3);
});

test('deletion reverses a sale once and a lost-response retry returns its original receipt',async()=>{
  const p=await product('Delete sale'),c=await customer('Delete customer');
  const batch=await post([item(p,4,2.25)],c);const payload=correction('delete_transaction_batch',batch);
  const before=(await read('dashboard')).totalBalance;
  const receipt=await mutate(payload);assert.equal(receipt.deleted,true);
  assert.deepEqual(await mutate({...payload,requestedAt:0}),receipt);
  assert.equal(await stock(p),100);assert.equal(await balance(c),0);
  assert.equal((await read('dashboard')).totalBalance,before-9);
  assert.equal((await rows('transaction_changes','where batch_id=$1',[batch])).length,1);
  assert.equal((await rows('transaction_changes','where batch_id=$1',[batch]))[0].after_state,null);
  await assert.rejects(mutate({...payload,reason:'Different request body'}),/different data/);
});

test('correcting a purchase checks final stock and blocks removal of already consumed stock with full rollback',async()=>{
  const p=await product('Purchase stock',0);const batch=await post([item(p,10,2,'In')]);
  await post([item(p,8,3)]);
  const [purchase]=await tx(batch);
  await mutate(correction('update_transaction_batch',batch,1,{items:[{id:purchase.id,...item(p,10,2.5,'In')}]}));
  assert.equal(await stock(p),2);
  const before=await read('dashboard'),history=await read('transactions'),audit=(await rows('transaction_changes')).length;
  await assert.rejects(mutate(correction('delete_transaction_batch',batch,2)),/insufficient stock/);
  await assert.rejects(mutate(correction('update_transaction_batch',batch,2,{items:[{id:purchase.id,...item(p,5,2.5,'In')}]})),/insufficient stock/);
  assert.deepEqual(await read('dashboard'),before);assert.deepEqual(await read('transactions'),history);assert.equal((await rows('transaction_changes')).length,audit);
});

test('batch edits can move the customer, replace products and add/remove lines without stale ledger entries',async()=>{
  const p=await product('Old item'),q=await product('Replacement item'),c=await customer('Original account'),d=await customer('Replacement account');
  const batch=await post([item(p,2,10),item(p,1,5)],c);const original=await tx(batch);
  await mutate(correction('update_transaction_batch',batch,1,{customerUuid:d,buyerName:'Replacement account',items:[{id:original[0].id,...item(q,3,7)},item(q,2,0)]}));
  assert.equal(await stock(p),100);assert.equal(await stock(q),95);assert.equal(await balance(c),0);assert.equal(await balance(d),21);
  assert.equal((await read('customer_ledger',c)).length,0);assert.equal((await read('customer_ledger',d))[0].amount,21);
  assert.equal((await tx(batch)).length,2);
  const current=await tx(batch);
  await mutate(correction('update_transaction_batch',batch,2,{customerUuid:'',items:current.map(x=>({id:x.id,...item(x.productUuid,x.qtyChange,x.unitPrice,x.type)}))}));
  assert.equal(await balance(d),0);assert.equal((await read('customer_ledger',d)).length,0);
});

test('stale, malformed, cross-order, duplicate and later-invalid edits cannot partially change records',async()=>{
  const p=await product('Validation product'),c=await customer('Validation customer');
  const batch=await post([item(p)],c),other=await post([item(p)]);const [original]=await tx(batch),[foreign]=await tx(other);
  const good=correction('update_transaction_batch',batch,1,{customerUuid:c,items:[{id:original.id,...item(p)}]});
  const before=await read('dashboard'),history=await read('transactions'),ledger=await read('customer_ledger',c);
  const invalid=[{expectedRevision:2},{reason:''},{items:[]},{items:[{id:foreign.id,...item(p)}]},
    {items:[{id:original.id,...item(p)},{id:original.id,...item(p)}]},
    {items:[{id:original.id,...item(p)},{...item(randomUUID())}]},
    {items:[{id:original.id,...item(p,1.5)}]},{items:[{id:original.id,...item(p,1,0.001)}]},
    {items:[{id:original.id,...item(p,1,2,'Bad')}]},{injected:true},{requestedAt:0}];
  for(const change of invalid)await assert.rejects(mutate({...good,...change}));
  assert.deepEqual(await read('dashboard'),before);assert.deepEqual(await read('transactions'),history);assert.deepEqual(await read('customer_ledger',c),ledger);
  assert.equal((await rows('operations','where request_id=$1',[good.requestId])).length,0);
});

test('constraint overflow rolls back correction, stock, finance and audit in the same transaction',async()=>{
  const p=await product('Overflow product'),c=await customer('Overflow customer');const batch=await post([item(p)],c);const [original]=await tx(batch);
  await db.exec('reset role');await db.query('update public.customers set current_balance=1000000000000 where id=$1',[c]);await identity();
  const before=await read('dashboard'),history=await read('transactions');
  const payload=correction('update_transaction_batch',batch,1,{customerUuid:c,items:[{id:original.id,...item(p,2,100)}]});
  await assert.rejects(mutate(payload),/check constraint/);
  assert.deepEqual(await read('dashboard'),before);assert.deepEqual(await read('transactions'),history);
  assert.equal((await rows('operations','where request_id=$1',[payload.requestId])).length,0);
});

test('changing sale/stock-in direction and mixed zero-net orders uses signed stock and account deltas',async()=>{
  const p=await product('Direction product'),c=await customer('Direction customer');
  const batch=await post([item(p,2,10)],c);const [original]=await tx(batch);
  const before=(await read('dashboard')).totalBalance;
  await mutate(correction('update_transaction_batch',batch,1,{customerUuid:c,items:[{id:original.id,...item(p,3,10,'In')}]}));
  assert.equal(await stock(p),103);assert.equal(await balance(c),-30);
  assert.equal((await read('dashboard')).totalBalance,before-50);
  assert.equal((await read('customer_ledger',c))[0].type,'Payable');
  await mutate(correction('update_transaction_batch',batch,2,{customerUuid:c,items:[{id:original.id,...item(p,3,10,'In')},item(p,3,10,'Out')]}));
  assert.equal(await stock(p),100);assert.equal(await balance(c),0);
  assert.equal((await read('customer_ledger',c))[0].amount,0);
  await mutate(correction('delete_transaction_batch',batch,3));
  assert.equal(await stock(p),100);assert.equal(await balance(c),0);
});

test('API confirmation reads persisted correction results and safely resolves a lost readback',async()=>{
  const p=await product('API confirmation'),c=await customer('API confirmation account');
  const batch=await post([item(p,2,10)],c),payload=correction('delete_transaction_batch',batch);
  const execute=async(name,args)=>name==='retail_mutate'?mutate(args.p_payload):{success:true,data:await read(args.p_action,args.p_customer_uuid)};
  await assert.rejects(commitTransactionCorrection(payload,async(name,args)=>{
    if(name==='retail_read')throw new Error('Readback response lost');
    return execute(name,args);
  }),error=>error.code==='CORRECTION_CONFIRMATION_PENDING'&&error.rolledBack===false);
  const result=await commitTransactionCorrection(payload,execute);
  assert.equal(result.commitConfirmed,true);assert.equal(result.transactions.some(t=>t.batchId===batch),false);
  assert.equal(result.customers.find(customer=>customer.uuid===c).balance,0);
  assert.equal(result.dashboard.products.find(product=>product.uuid===p).quantity,100);
  assert.deepEqual(result.ledgers.find(ledger=>ledger.customerUuid===c).data,[]);
  assert.equal((await rows('transaction_changes','where batch_id=$1',[batch])).length,1);
  assert.deepEqual(result.reports,await read('reports'));
});
