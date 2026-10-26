import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOperation, finishOperation } from '../src/lib/operations.ts';

test('matching client retries preserve identity after a lost or failed response', async () => {
  const payload = { action: 'transaction', productUuid: 'test-product', qtyChange: 2, type: 'Out', unitPrice: 1 };
  const first = await prepareOperation(payload);
  const retry = await prepareOperation({ unitPrice: 1, type: 'Out', qtyChange: 2, productUuid: 'test-product', action: 'transaction' });
  assert.equal(retry.payload.requestId, first.payload.requestId);
  assert.equal(retry.payload.requestedAt, first.payload.requestedAt);
  finishOperation(first.key);
  const nextOrder = await prepareOperation(payload);
  assert.notEqual(nextOrder.payload.requestId, first.payload.requestId);
  finishOperation(nextOrder.key);
});

test('actual apiFetch retries a lost response with the original operation ID', async () => {
  const { apiFetch } = await import('../src/lib/api.ts');
  const previousFetch = globalThis.fetch;
  const receipts = [];
  globalThis.fetch = async (_url, options) => {
    receipts.push(JSON.parse(options.body));
    if (receipts.length === 1) throw new Error('Lost response');
    return Response.json({ success: true });
  };
  try {
    const options = { method: 'POST', body: JSON.stringify({ action: 'add_customer', name: 'Retry customer' }) };
    await assert.rejects(apiFetch('/api/proxy/', options));
    await apiFetch('/api/proxy/', options);
    assert.equal(receipts[0].requestId, receipts[1].requestId);
    await apiFetch('/api/proxy/', options);
    assert.notEqual(receipts[1].requestId, receipts[2].requestId);
  } finally { globalThis.fetch = previousFetch; }
});

test('old receipts reach the database for committed-result lookup instead of being discarded',async()=>{
  const receipt=await prepareOperation({action:'add_customer',name:'Old receipt',requestId:'11111111-1111-4111-8111-111111111111',requestedAt:1});
  assert.equal(receipt.payload.requestedAt,1);
  assert.equal(receipt.payload.requestId,'11111111-1111-4111-8111-111111111111');
  finishOperation(receipt.key);
});

test('an explicitly recovered financial receipt takes precedence over stale same-body cache state', async () => {
  const body = { action: 'record_customer_payment', customerUuid: '11111111-1111-4111-8111-111111111111', type: 'Receivable', amount: 20000, description: 'Recovered receipt precedence' };
  const stale = await prepareOperation(body);
  const recovered = await prepareOperation({ ...body, requestId: '22222222-2222-4222-8222-222222222222', requestedAt: 1234 });
  assert.notEqual(recovered.payload.requestId, stale.payload.requestId);
  assert.equal(recovered.payload.requestId, '22222222-2222-4222-8222-222222222222');
  assert.equal(recovered.payload.requestedAt, 1234);
  finishOperation(recovered.key);
});
