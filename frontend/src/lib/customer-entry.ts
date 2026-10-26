import { prepareOperation } from './operations.ts';

const DRAFT_KEY = 'RETAIL_CUSTOMER_ENTRY_PENDING';
export type CustomerEntryPayload = {
  action: 'record_customer_payment'; customerUuid: string; amount: number;
  type: 'Receivable' | 'Payable'; description: string; requestId: string; requestedAt: number;
};
let memory: CustomerEntryPayload | null = null;

export function customerEntryError(amount: number, description: string) {
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000_000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return 'Enter an amount from PKR 0.01 to 1,000,000,000 with up to two decimal places.';
  if (description.length > 2000) return 'Keep the reference within 2,000 characters.';
  return '';
}

export async function prepareCustomerEntry(customerUuid: string, amount: number, type: 'Receivable' | 'Payable', description: string) {
  const error = customerEntryError(amount, description);
  if (error) throw new Error(error);
  const existing = readPendingCustomerEntry();
  if (existing) {
    if (existing.customerUuid === customerUuid && existing.amount === amount && existing.type === type && existing.description === description) return existing;
    throw new Error('Another customer entry still needs confirmation. Verify the recovery draft before creating a different entry.');
  }
  const operation = await prepareOperation({ action: 'record_customer_payment', customerUuid, amount, type, description });
  const payload = operation.payload as CustomerEntryPayload;
  memory = payload;
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); } catch { /* Retain the recovery draft in this window when storage is unavailable. */ }
  return payload;
}

export function readPendingCustomerEntry(): CustomerEntryPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
    if (value && value.action === 'record_customer_payment' && typeof value.customerUuid === 'string' && uuid.test(value.customerUuid) && ['Receivable', 'Payable'].includes(value.type) && typeof value.description === 'string' && !customerEntryError(value.amount, value.description) && typeof value.requestId === 'string' && uuid.test(value.requestId) && Number.isFinite(value.requestedAt)) { memory = value; return value; }
    memory = null;
    return null;
  } catch { /* Invalid or inaccessible storage must not prevent opening accounts. */ }
  return memory;
}

export function clearPendingCustomerEntry(requestId?: string) {
  if (requestId && readPendingCustomerEntry()?.requestId !== requestId) return;
  memory = null;
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* Memory has already been cleared. */ }
}
