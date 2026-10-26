import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionError, prepareCorrection, readPendingCorrection, clearPendingCorrection } from '../src/lib/transaction-correction.ts';

const uuid='11111111-1111-4111-8111-111111111111';
const intent={action:'update_transaction_batch',batchId:uuid,expectedRevision:1,reason:'Correct quantity',customerUuid:'',buyerName:'Buyer',description:'Note',items:[{id:uuid,productUuid:uuid,type:'Out',qtyChange:2,unitPrice:10.25}]};

test('correction validation allows zero prices and rejects invalid money, quantities, missing reasons and revisions',()=>{
  assert.equal(correctionError(intent),'');
  assert.equal(correctionError({...intent,items:[{...intent.items[0],unitPrice:0}]}),'');
  for(const change of [{expectedRevision:0},{expectedRevision:NaN},{reason:' '},{reason:'x'.repeat(1001)},{batchId:'bad'},{items:[]},{items:[intent.items[0],intent.items[0]]},{items:[{...intent.items[0],qtyChange:1.5}]},{items:[{...intent.items[0],unitPrice:0.001}]},{items:[{...intent.items[0],unitPrice:Infinity}]}])assert.ok(correctionError({...intent,...change}));
  assert.equal(correctionError({action:'delete_transaction',transactionId:uuid,expectedRevision:1,reason:'Remove duplicate'}),'');
});

test('an uncertain correction survives a document reload and blocks replacement with a different change',async()=>{
  const previous=globalThis.window,values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  globalThis.window={localStorage:storage,sessionStorage:storage};
  try{
    const original=await prepareCorrection(intent,'Order · 1 product');
    assert.deepEqual(readPendingCorrection(),original);
    const reloaded=await import('../src/lib/transaction-correction.ts?new-document');
    assert.deepEqual(reloaded.readPendingCorrection(),original);
    await assert.rejects(prepareCorrection({...intent,reason:'Different change'},'Other order'),/pending/);
    clearPendingCorrection('not-this-reference');assert.deepEqual(readPendingCorrection(),original);
    clearPendingCorrection(original.payload.requestId);assert.equal(readPendingCorrection(),null);
  }finally{globalThis.window=previous;}
});
