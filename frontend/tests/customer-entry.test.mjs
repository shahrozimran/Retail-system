import test from 'node:test';
import assert from 'node:assert/strict';
import { commitCustomerEntry } from '../src/lib/customer-entry-server.ts';
import { prepareCustomerEntry, readPendingCustomerEntry, clearPendingCustomerEntry, customerEntryError } from '../src/lib/customer-entry.ts';
import { formatMoney } from '../src/lib/money.ts';

const uuid = '11111111-1111-4111-8111-111111111111';
const payload = { action: 'record_customer_payment', customerUuid: uuid, type: 'Receivable', amount: 20000, description: 'Account entry' };

test('customer entry success waits for committed database readback of balance and ledger', async () => {
  let commit;
  const gate = new Promise(resolve => { commit = resolve; });
  const calls = [];
  const result = commitCustomerEntry(payload, async (name, args) => {
    calls.push(name);
    if (name === 'retail_mutate') { await gate; return { success: true, uuid }; }
    return { success: true, data: args.p_action === 'customers' ? [{ uuid, balance: 20000 }] : [{ id: 'entry-1', amount: 20000, balanceSnapshot: 20000 }] };
  });
  await Promise.resolve();
  assert.deepEqual(calls, ['retail_mutate']);
  commit();
  const saved = await result;
  assert.equal(saved.commitConfirmed, true);
  assert.equal(saved.customer.balance, 20000);
  assert.equal(saved.ledger[0].balanceSnapshot, 20000);
});

test('a failed confirmation is never reported as a successful or rolled-back save', async () => {
  await assert.rejects(commitCustomerEntry(payload, async name => {
    if (name === 'retail_mutate') return { success: true, uuid };
    throw new Error('Read response lost');
  }), error => error.status === 503 && error.code === 'ENTRY_CONFIRMATION_PENDING' && error.rolledBack === false);
  const rollback = new Error('Write rolled back');
  await assert.rejects(commitCustomerEntry(payload, async () => { throw rollback; }), error => error === rollback);
});

test('pending customer entries survive a reload with their original retry identity', async () => {
  const previous = globalThis.window;
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.window = { sessionStorage: storage, localStorage: storage };
  try {
    const original = await prepareCustomerEntry(uuid, 20000, 'Receivable', 'Keep these details');
    const recovered = readPendingCustomerEntry();
    assert.deepEqual(recovered, original);
    const reloaded = await import('../src/lib/customer-entry.ts?reloaded');
    assert.deepEqual(reloaded.readPendingCustomerEntry(), original);
    assert.ok(original.requestId);
    const retry = await prepareCustomerEntry(uuid, 20000, 'Receivable', 'Keep these details');
    assert.equal(retry.requestId, original.requestId);
    clearPendingCustomerEntry();
    assert.equal(readPendingCustomerEntry(), null);
  } finally { globalThis.window = previous; }
});

test('financial amounts display both decimal places instead of rounding ledger balances', () => {
  assert.equal(formatMoney(40999.75), 'PKR 40,999.75');
  assert.equal(formatMoney(3500.25), 'PKR 3,500.25');
  assert.equal(formatMoney(0.01), 'PKR 0.01');
});

test('customer entry validation accepts decimal amounts and rejects invalid financial values', () => {
  assert.equal(customerEntryError(0.01, ''), '');
  assert.equal(customerEntryError(20000.25, 'Reference'), '');
  for (const amount of [0, -1, NaN, Infinity, 0.001, 1_000_000_001]) assert.ok(customerEntryError(amount, ''));
});
