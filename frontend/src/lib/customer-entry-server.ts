import { ApiError } from './server.ts';

type Execute = (name: string, parameters: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; [key: string]: unknown }>;

/** Acknowledge a ledger entry only after its transaction commits and reads back. */
export async function commitCustomerEntry(payload: Record<string, unknown>, execute: Execute) {
  const receipt = await execute('retail_mutate', { p_payload: payload });
  try {
    const [customers, ledger] = await Promise.all([
      execute('retail_read', { p_action: 'customers', p_customer_uuid: null }),
      execute('retail_read', { p_action: 'customer_ledger', p_customer_uuid: payload.customerUuid }),
    ]);
    if (!Array.isArray(customers.data) || !Array.isArray(ledger.data) || !ledger.data.length) throw new Error('Readback missing.');
    const customer = customers.data.find(item => typeof item?.uuid === 'string' && item.uuid.toLowerCase() === String(payload.customerUuid).toLowerCase());
    if (!customer || !Number.isFinite(customer.balance)) throw new Error('Customer readback missing.');
    return { ...receipt, commitConfirmed: true, customer, customers: customers.data, ledger: ledger.data, confirmedAt: new Date().toISOString() };
  } catch {
    // The write may already be committed. Keep the original operation receipt
    // so a retry reads that result instead of inserting a second ledger entry.
    throw new ApiError('The entry may already be saved, but confirmation could not finish. Retry the same entry to verify it safely.', 503, 'ENTRY_CONFIRMATION_PENDING');
  }
}
