import { ApiError } from './server.ts';

type Execute = (name: string, parameters: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; [key: string]: unknown }>;

export async function commitTransactionCorrection(payload: Record<string, unknown>, execute: Execute) {
  const receipt = await execute('retail_mutate', { p_payload: payload });
  try {
    const affected = Array.isArray(receipt.customerUuids) ? receipt.customerUuids : [];
    const actions = ['transactions', 'dashboard', 'customers', 'reports'];
    const values = await Promise.all(actions.map(p_action => execute('retail_read', { p_action, p_customer_uuid: null })));
    const [transactions, dashboard, customers, reports] = values.map(value => value.data);
    if (!Array.isArray(transactions) || !Array.isArray(customers) || !Array.isArray(reports) || !dashboard || typeof dashboard !== 'object' || !('products' in dashboard) || !Array.isArray(dashboard.products)) throw new Error('Readback incomplete.');
    const ledgers = await Promise.all(affected.map(async customerUuid => {
      const result = await execute('retail_read', { p_action: 'customer_ledger', p_customer_uuid: customerUuid });
      if (!Array.isArray(result.data)) throw new Error('Ledger readback incomplete.');
      return { customerUuid, data: result.data };
    }));
    return { ...receipt, commitConfirmed: true, transactions, dashboard, customers, reports, ledgers };
  } catch {
    throw new ApiError('The change may already be saved. Retry confirmation with the original reference to verify it without applying it twice.', 503, 'CORRECTION_CONFIRMATION_PENDING');
  }
}
