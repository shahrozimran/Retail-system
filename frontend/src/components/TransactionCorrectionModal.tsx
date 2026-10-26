'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Pencil, Plus, Trash2, X, ShieldCheck } from 'lucide-react';
import Dialog from '@/components/Dialog';
import { apiFetch, PROXY } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { correctionError, type CorrectionIntent, type CorrectionTarget, type PendingCorrection } from '@/lib/transaction-correction';

type Product = { uuid: string; name: string; sku: string; quantity: number };
type Customer = { uuid: string; name: string; phone: string };
type Line = { key: string; id?: string; productUuid: string; type: 'In' | 'Out'; quantity: string; price: string };
const control = 'w-full rounded-lg border border-line bg-muted px-3 py-2.5 text-sm text-ink';
const fetcher = async (url: string) => { const response = await apiFetch(url); if (!response.ok) throw new Error('Could not load current products or customer accounts.'); return response.json(); };

export default function TransactionCorrectionModal({ target, pending, onSubmit, onClose }: {
  target: CorrectionTarget | null; pending: PendingCorrection | null;
  onSubmit: (intent: CorrectionIntent | null, label: string) => Promise<void>; onClose: () => void;
}) {
  const first = target?.items[0];
  const deletion = pending ? pending.payload.action.startsWith('delete_') : target?.mode === 'delete';
  const batch = pending ? pending.payload.action.endsWith('_batch') : target?.scope === 'batch';
  const label = pending?.label ?? (batch ? `Order · ${target?.items.length ?? 0} ${target?.items.length === 1 ? 'product' : 'products'}` : first?.productName ?? 'Transaction');
  const [lines, setLines] = useState<Line[]>(() => target?.items.map(item => ({ key: item.id, id: item.id, productUuid: item.productUuid, type: item.type as 'In' | 'Out', quantity: String(item.qtyChange), price: String(item.unitPrice) })) ?? []);
  const [customerUuid, setCustomerUuid] = useState(first?.customerUuid ?? '');
  const [buyerName, setBuyerName] = useState(first?.buyerName ?? '');
  const [description, setDescription] = useState(first?.description ?? '');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const { data: dashboard, error: productsError } = useSWR(!deletion && !pending ? PROXY + '?action=dashboard' : null, fetcher);
  const { data: accounts, error: customersError } = useSWR(!deletion && batch && !pending ? PROXY + '?action=customers' : null, fetcher);
  const products: Product[] = Array.isArray(dashboard?.data?.products) ? dashboard.data.products : [];
  const customers: Customer[] = Array.isArray(accounts?.data) ? accounts.data : [];
  const ready = Number.isSafeInteger(first?.revision) && first!.revision! > 0;
  const action = `${deletion ? 'delete' : 'update'}_transaction${batch ? '_batch' : ''}`;
  const items = lines.map(line => ({ ...(line.id ? { id: line.id } : {}), productUuid: line.productUuid, type: line.type, qtyChange: Number(line.quantity), unitPrice: line.price === '' ? NaN : Number(line.price) }));
  const intent: CorrectionIntent = {
    action, expectedRevision: first?.revision ?? 0, reason,
    ...(batch ? { batchId: first?.batchId } : { transactionId: first?.id }),
    ...(!deletion ? batch ? { items, customerUuid, buyerName, description } : { productUuid: items[0]?.productUuid, type: items[0]?.type, qtyChange: items[0]?.qtyChange, unitPrice: items[0]?.unitPrice } : {}),
  };
  const total = items.reduce((sum, item) => sum + (Number.isFinite(item.qtyChange * item.unitPrice) ? item.qtyChange * item.unitPrice : 0), 0);
  const update = (key: string, values: Partial<Line>) => setLines(current => current.map(line => line.key === key ? { ...line, ...values } : line));
  const close = () => { if (!loading) onClose(); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const validation = pending ? '' : correctionError(intent);
    if (validation) { setError(validation); return; }
    inFlight.current = true; setLoading(true); setError('');
    try { await onSubmit(pending ? null : intent, label); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The change is not confirmed. Your original reference is kept for retry.'); }
    finally { inFlight.current = false; setLoading(false); }
  };

  return <Dialog label={pending ? 'Verify transaction change' : `${deletion ? 'Delete' : 'Edit'} ${batch ? 'order' : 'transaction'}`} onClose={close} busy={loading}>
    <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={close} />
    <form onSubmit={submit} className="modal-panel relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-dialog">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line p-5">
        <div className="flex items-center gap-3"><span className={`rounded-xl p-2.5 ${deletion ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand-ink'}`}>{deletion ? <Trash2 className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}</span><div><h2 className="text-lg font-semibold text-ink">{pending ? 'Verify transaction change' : `${deletion ? 'Delete' : 'Edit'} ${batch ? 'order' : 'transaction'}`}</h2><p className="text-xs text-subtle mt-1 break-words">{label}</p></div></div>
        <button type="button" onClick={close} disabled={loading} aria-label="Close transaction dialog" className="rounded-lg p-2 text-subtle hover:bg-muted disabled:opacity-40"><X className="h-5 w-5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-5 sm:p-6">
        {error && <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger"><p>{error}</p>{!pending && <button type="button" onClick={close} className="mt-2 underline font-semibold">Close and reload current records</button>}</div>}
        {pending ? <div className="rounded-xl border border-warning/20 bg-warning-soft p-4 space-y-3 text-sm"><p className="font-semibold text-ink">{loading ? 'Saving and verifying your change…' : 'This change still needs confirmation.'}</p><p className="text-body">{pending.payload.action.startsWith('delete_') ? 'Deletion' : 'Edit'}: {pending.label}</p><p className="text-subtle whitespace-pre-wrap break-words">Reason: {pending.payload.reason}</p><p className="text-subtle">Retry uses the original reference. If the change already committed, it will not be applied twice.</p></div> : <>
          {!ready && <div role="alert" className="rounded-xl bg-warning-soft border border-warning/20 p-4 text-sm text-warning">Run the transaction correction SQL migration in Supabase, then close this dialog and refresh Transactions.</div>}
          {deletion ? <><div className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-body"><p className="font-semibold text-danger">Delete {batch ? 'this entire order' : 'this transaction item'}?</p><p className="mt-2">{batch ? 'Every item in this order will be removed.' : 'Only this item will be removed. Other items in the order stay.'} Linked stock, finances and customer balances will update together. An audit copy is retained.</p><p className="mt-2">Stock purchases cannot be removed if their stock has already been used.</p></div><div className="divide-y divide-line rounded-xl border border-line">{target?.items.map(item => <div key={item.id} className="flex justify-between gap-4 p-3 text-sm"><div className="min-w-0"><p className="font-semibold break-words">{item.productName}</p><p className="text-xs text-subtle mt-1">{item.type === 'Out' ? 'Sale' : 'Stock in'} · {item.qtyChange} × {formatMoney(item.unitPrice)}</p></div><span className="shrink-0 tabular-nums">{formatMoney(item.total)}</span></div>)}</div></> : <>
            {(productsError || customersError) && <p role="alert" className="text-sm text-danger">Could not load current products or accounts. Close and reopen this dialog to retry.</p>}
            <fieldset disabled={loading} className="space-y-4">
              {lines.map((line, index) => <div key={line.key} className="rounded-xl border border-line bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-subtle uppercase">Item {index + 1}</h3>{batch && <button type="button" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines(current => current.filter(item => item.key !== line.key))} className="text-xs flex items-center gap-1 text-danger disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}</div>
                <label className="block text-xs text-subtle font-medium">Product<select aria-label={`Product ${index + 1}`} required className={`${control} mt-1.5`} value={line.productUuid} onChange={event => update(line.key, { productUuid: event.target.value })}><option value="">Select a product</option>{!products.some(product => product.uuid === line.productUuid) && line.productUuid && <option value={line.productUuid}>{target?.items.find(item => item.productUuid === line.productUuid)?.productName ?? 'Current product'}</option>}{products.map(product => <option key={product.uuid} value={product.uuid}>{product.sku} · {product.name} ({product.quantity} in stock)</option>)}</select></label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <label className="block text-xs text-subtle font-medium">Type<select aria-label={`Type ${index + 1}`} className={`${control} mt-1.5`} value={line.type} onChange={event => update(line.key, { type: event.target.value as 'In' | 'Out' })}><option value="Out">Sale</option><option value="In">Stock in</option></select></label>
                  <label className="block text-xs text-subtle font-medium">Quantity<input aria-label={`Quantity ${index + 1}`} required type="number" min="1" max="1000000" step="1" className={`${control} mt-1.5`} value={line.quantity} onChange={event => update(line.key, { quantity: event.target.value.replace(/^0+(?=\d)/, '') })} /></label>
                  <label className="block text-xs text-subtle font-medium col-span-2 sm:col-span-1">Unit price (PKR)<input aria-label={`Unit price ${index + 1}`} required type="number" min="0" max="1000000000" step="0.01" placeholder="0.00" className={`${control} mt-1.5`} value={line.price} onChange={event => update(line.key, { price: event.target.value.replace(/^0+(?=\d)/, '') })} /></label>
                </div>
              </div>)}
              {batch && <button type="button" disabled={lines.length >= 100} onClick={() => setLines(current => [...current, { key: crypto.randomUUID(), productUuid: '', type: 'Out', quantity: '1', price: '' }])} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line p-3 text-sm text-brand-ink disabled:opacity-40"><Plus className="h-4 w-4" /> Add product</button>}
              {batch && <div className="grid sm:grid-cols-2 gap-4 border-t border-line pt-4">
                <label className="block text-xs text-subtle font-medium">Customer account<select aria-label="Customer account" className={`${control} mt-1.5`} value={customerUuid} onChange={event => { const uuid = event.target.value; setCustomerUuid(uuid); const account = customers.find(customer => customer.uuid === uuid); if (account) setBuyerName(account.name); }}><option value="">No linked account</option>{customerUuid && !customers.some(customer => customer.uuid === customerUuid) && <option value={customerUuid}>Current linked customer</option>}{customers.map(customer => <option key={customer.uuid} value={customer.uuid}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label>
                <label className="block text-xs text-subtle font-medium">Buyer name<input aria-label="Buyer name" maxLength={200} className={`${control} mt-1.5`} value={buyerName} onChange={event => setBuyerName(event.target.value)} /></label>
                <label className="block text-xs text-subtle font-medium sm:col-span-2">Order note<textarea aria-label="Order note" maxLength={2000} rows={2} className={`${control} mt-1.5 resize-y`} value={description} onChange={event => setDescription(event.target.value)} /></label>
              </div>}
            </fieldset>
            <div className="flex justify-between rounded-xl bg-muted p-4 text-sm"><span className="text-subtle">{batch ? 'Updated order total' : 'Updated item total'}</span><strong className="text-ink tabular-nums">{formatMoney(total)}</strong></div>
          </>}
          <label className="block text-xs font-semibold text-subtle">Reason for {deletion ? 'deletion' : 'change'} <span className="text-danger">*</span><textarea aria-label="Reason for change" required maxLength={1000} rows={3} className={`${control} mt-2 resize-y`} placeholder="Explain what needs correcting…" value={reason} onChange={event => setReason(event.target.value)} disabled={loading} /></label>
          <p className="text-xs text-subtle flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0" /> Changes are confirmed against Supabase before this dialog closes. Older edits from another window are rejected.</p>
        </>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-line bg-muted/40 p-5">
        <button type="button" disabled={loading} onClick={close} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-body disabled:opacity-40">{pending ? 'Keep for later' : 'Cancel'}</button>
        <button type="submit" disabled={loading || (!pending && (!ready || !reason.trim()))} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${deletion && !pending ? 'bg-danger text-white' : 'bg-brand text-on-brand hover:bg-brand-hover'}`}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? 'Saving and verifying…' : pending ? 'Retry confirmation' : deletion ? batch ? 'Delete entire order' : 'Delete transaction' : 'Save changes'}
        </button>
      </div>
    </form>
  </Dialog>;
}
