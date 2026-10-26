import { prepareOperation } from './operations.ts';

export const CORRECTION_ACTIONS = new Set(['update_transaction', 'delete_transaction', 'update_transaction_batch', 'delete_transaction_batch']);
export type TransactionRecord = {
  id: string; date: string; productUuid: string; productName: string; productSku: string;
  type: string; qtyChange: number; unitPrice: number; total: number; description: string;
  buyerName: string; batchId: string; customerUuid?: string; revision?: number;
};
export type CorrectionItem = { id?: string; productUuid: string; type: 'In' | 'Out'; qtyChange: number; unitPrice: number };
export type CorrectionIntent = {
  action: string; expectedRevision: number; reason: string; batchId?: string; transactionId?: string;
  items?: CorrectionItem[]; productUuid?: string; type?: 'In' | 'Out'; qtyChange?: number; unitPrice?: number;
  customerUuid?: string; buyerName?: string; description?: string;
};
export type PendingCorrection = { payload: CorrectionIntent & { requestId: string; requestedAt: number }; label: string };
export type CorrectionTarget = { mode: 'edit' | 'delete'; scope: 'item' | 'batch'; items: TransactionRecord[] };
const KEY = 'RETAIL_TRANSACTION_CORRECTION_PENDING';
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
let memory: PendingCorrection | null = null;

export function correctionError(intent: CorrectionIntent) {
  if (!CORRECTION_ACTIONS.has(intent.action)) return 'Choose a valid transaction action.';
  if (!Number.isSafeInteger(intent.expectedRevision) || intent.expectedRevision < 1) return 'Run the transaction correction SQL migration in Supabase, then refresh this page.';
  if (!uuid(intent.action.endsWith('_batch') ? intent.batchId : intent.transactionId)) return 'Refresh and select a saved transaction.';
  if (typeof intent.reason !== 'string' || !intent.reason.trim() || intent.reason.length > 1000) return 'Add a reason for this change (up to 1,000 characters).';
  if (intent.action.startsWith('delete_')) return '';
  if (intent.customerUuid && !uuid(intent.customerUuid)) return 'Select a valid customer account.';
  if ((intent.buyerName?.length ?? 0) > 200 || (intent.description?.length ?? 0) > 2000) return 'Keep the buyer name within 200 characters and the note within 2,000.';
  const items = intent.action.endsWith('_batch') ? intent.items : [intent];
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) return 'An order must contain 1 to 100 products.';
  const ids = new Set<string>();
  for (const item of items) {
    if (!uuid(item.productUuid) || !['In', 'Out'].includes(item.type ?? '')) return 'Select a product and transaction type for every item.';
    if (!Number.isInteger(item.qtyChange) || item.qtyChange! < 1 || item.qtyChange! > 1_000_000) return 'Enter a whole quantity from 1 to 1,000,000 for every item.';
    const price = item.unitPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 1_000_000_000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) return 'Enter a price from PKR 0 to 1,000,000,000 with up to two decimal places.';
    if (item.qtyChange! * price > 1_000_000_000_000) return 'An item total cannot exceed PKR 1,000,000,000,000.';
    if ('id' in item && item.id) {
      if (!uuid(item.id) || ids.has(item.id)) return 'An order item is invalid or repeated. Refresh the order.';
      ids.add(item.id);
    }
  }
  return '';
}

export function readPendingCorrection(): PendingCorrection | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (value && typeof value.label === 'string' && value.label.length <= 300 && value.payload && !correctionError(value.payload) && uuid(value.payload.requestId) && Number.isSafeInteger(value.payload.requestedAt)) { memory = value; return value; }
    memory = null;
  } catch { /* Keep a memory copy if device storage is unavailable. */ }
  return memory;
}

export async function prepareCorrection(intent: CorrectionIntent, label: string): Promise<PendingCorrection> {
  const error = correctionError(intent);
  if (error) throw new Error(error);
  if (readPendingCorrection()) throw new Error('Verify the pending transaction change before submitting a different one.');
  const operation = await prepareOperation({ ...intent });
  const draft = { payload: operation.payload as PendingCorrection['payload'], label: label.slice(0, 300) };
  memory = draft;
  try { window.localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* The current window retains the original receipt. */ }
  return draft;
}

export function clearPendingCorrection(requestId: string) {
  if (readPendingCorrection()?.payload.requestId !== requestId) return;
  memory = null;
  try { window.localStorage.removeItem(KEY); } catch { /* Memory already cleared. */ }
}
