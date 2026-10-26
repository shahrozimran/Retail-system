'use client';

import { useRef, useState } from 'react';
import useSWR, { mutate as updateCache } from 'swr';
import { Plus, Inbox, Loader2, Calendar, CheckCircle, ChevronDown, ChevronRight, Search, Pencil, Trash2, RefreshCw } from 'lucide-react';
import PageHeading from '@/components/PageHeading';
import SummaryStrip from '@/components/SummaryStrip';
import TransactionModal from '@/components/TransactionModal';
import TransactionCorrectionModal from '@/components/TransactionCorrectionModal';
import { useMounted } from '@/hooks/useMounted';
import { API_URL, PROXY, apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { clearPendingCorrection, prepareCorrection, readPendingCorrection, type CorrectionIntent, type CorrectionTarget, type TransactionRecord } from '@/lib/transaction-correction';

type Batch = { id: string; items: TransactionRecord[]; total: number };
const fetcher = async (url: string) => { const response = await apiFetch(url); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || 'Could not load transactions.'); return result; };
function groupTransactions(transactions: TransactionRecord[]): Batch[] {
  const groups = new Map<string, Batch>();
  for (const item of transactions) {
    const id = item.batchId || item.id;
    const group = groups.get(id) ?? { id, items: [], total: 0 };
    group.items.push(item); group.total += item.total; groups.set(id, group);
  }
  return [...groups.values()];
}

export default function Transactions() {
  const { data: response, error, isLoading, mutate } = useSWR(API_URL ? PROXY + '?action=transactions' : null, fetcher, { shouldRetryOnError: false });
  const transactions: TransactionRecord[] = Array.isArray(response?.data) ? response.data : [];
  const batches = groupTransactions(transactions);
  const mounted = useMounted();
  const [recording, setRecording] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [pending, setPending] = useState(readPendingCorrection);
  const [recoveryOpen, setRecoveryOpen] = useState(() => Boolean(pending));
  const correctionInFlight = useRef(false);
  const filtered = batches.filter(batch => {
    if (filter !== 'all' && !batch.items.some(item => item.type === filter)) return false;
    const query = search.toLowerCase().trim();
    return !query || batch.items.some(item => [item.buyerName, item.productName, item.productSku, item.description, item.batchId].some(value => value?.toLowerCase().includes(query)));
  });
  const open = (mode: 'edit' | 'delete', scope: 'item' | 'batch', items: TransactionRecord[]) => {
    const recovered = readPendingCorrection();
    if (recovered) { setPending(recovered); setRecoveryOpen(true); return; }
    setTarget({ mode, scope, items }); setNotice(''); setPageError('');
  };
  const close = () => { if (!correctionInFlight.current) { setTarget(null); setRecoveryOpen(false); void mutate(); } };
  const submit = async (intent: CorrectionIntent | null, label: string) => {
    if (correctionInFlight.current) return;
    correctionInFlight.current = true;
    let committed = false;
    try {
      const draft = pending ?? await prepareCorrection(intent!, label);
      setPending(draft);
      const response = await apiFetch(PROXY, { method: 'POST', body: JSON.stringify(draft.payload) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.commitConfirmed || !Array.isArray(result.transactions) || !Array.isArray(result.customers) || !Array.isArray(result.reports) || !Array.isArray(result.dashboard?.products) || !Array.isArray(result.ledgers)) {
        if (result.operationState === 'rolled_back') { clearPendingCorrection(draft.payload.requestId); setPending(null); }
        throw new Error(result.message || 'The change is not confirmed yet. Retry confirmation with the original reference.');
      }
      committed = true;
      clearPendingCorrection(draft.payload.requestId); setPending(null);
      await Promise.all([
        mutate({ success: true, data: result.transactions }, { revalidate: false }),
        ...(['dashboard', 'customers', 'reports'] as const).map(action => updateCache(PROXY + '?action=' + action, { success: true, data: result[action] }, { revalidate: false })),
        updateCache(PROXY + '?action=products'),
        ...result.ledgers.map((ledger: { customerUuid: string; data: unknown[] }) => updateCache(PROXY + '?action=customer_ledger&customerUuid=' + ledger.customerUuid, { success: true, data: ledger.data }, { revalidate: false })),
      ]);
      setTarget(null); setRecoveryOpen(false);
      setNotice(`${draft.payload.action.startsWith('delete_') ? 'Deletion' : 'Changes'} saved to Supabase and verified. Stock, finances and customer balances are up to date.`);
    } catch (failure) {
      if (committed) { setTarget(null); setRecoveryOpen(false); setNotice('The change is saved to Supabase. Refresh to reload the latest display.'); }
      else { const recovered = readPendingCorrection(); setPending(recovered); if (recovered && !target) setRecoveryOpen(true); if (!recovered) { setPageError(failure instanceof Error ? failure.message : 'The change was not saved. Refresh and try again.'); void mutate(); } throw failure; }
    } finally { correctionInFlight.current = false; }
  };
  const actions = (items: TransactionRecord[], scope: 'item' | 'batch') => {
    const name = scope === 'batch' && items.length > 1 ? 'order' : items[0].productName;
    return <div className="flex shrink-0 items-center gap-2">
      <button type="button" onClick={() => open('edit', scope, items)} aria-label={`Edit ${name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-body hover:bg-brand-soft hover:text-brand-ink transition-colors"><Pencil className="h-3.5 w-3.5" /> Edit</button>
      <button type="button" onClick={() => open('delete', scope, items)} aria-label={`Delete ${name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/20 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-soft transition-colors"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
    </div>;
  };
  if (!mounted) return null;

  return <div className="space-y-6 fade-in">
    <PageHeading title="Transactions" description="Manage sales, stock movements and corrections in one place." />
    {pageError && <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{pageError}<button onClick={() => setPageError('')} className="ml-3 text-xs underline">Dismiss</button></div>}
    {notice && <div role="status" className="flex items-start gap-3 rounded-xl border border-success/20 bg-success-soft p-4 text-sm text-success"><CheckCircle className="h-5 w-5 shrink-0" /><span>{notice}</span><button onClick={() => setNotice('')} className="ml-auto text-xs underline">Dismiss</button></div>}
    {pending && !target && !recoveryOpen && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning"><span>A transaction change still needs confirmation. Its original reference is kept on this device.</span><button onClick={() => setRecoveryOpen(true)} className="ml-auto font-semibold underline">Verify pending change</button></div>}
    {transactions.some(item => !Number.isSafeInteger(item.revision)) && <div role="status" className="rounded-xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">Database setup is needed for edits and deletions. Run <span className="font-mono break-all">202610260002_transaction_corrections.sql</span> in Supabase, then refresh this list.</div>}
    <SummaryStrip items={[{ label: 'Recorded orders', value: batches.length }, { label: 'Total sales', value: formatMoney(transactions.filter(item => item.type === 'Out').reduce((sum, item) => sum + item.total, 0)) }, { label: 'Total stock purchases', value: formatMoney(transactions.filter(item => item.type === 'In').reduce((sum, item) => sum + item.total, 0)) }]} />
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-col justify-between gap-4 border-b border-line p-5 xl:flex-row xl:items-center">
        <div><h2 className="text-[15px] font-semibold text-ink">Transaction history</h2><p className="mt-1 text-xs text-subtle">Edit an item or an entire order. Linked stock and balances update together.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-44"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" /><input aria-label="Search transactions" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buyer, product or SKU…" className="w-full rounded-lg border border-line bg-muted py-2 pl-9 pr-3 text-sm text-ink xl:w-56" /></div>
          <button onClick={() => void mutate()} aria-label="Refresh transactions" className="rounded-lg border border-line p-2 text-subtle hover:bg-muted"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setRecording(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-hover"><Plus className="h-4 w-4" /> Record Transaction</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-line bg-muted/40 px-5 py-3" aria-label="Filter transaction type">{[['all', 'All activity'], ['Out', 'Sales'], ['In', 'Stock in']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === value ? 'bg-brand-soft text-brand-ink' : 'text-subtle hover:bg-emphasis'}`}>{label}</button>)}</div>
      <div className="divide-y divide-line">
        {isLoading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-subtle" /></div> : error ? <div role="alert" className="p-8 text-center text-danger">{error.message}</div> : !filtered.length ? <div className="p-12 text-center text-subtle"><Inbox className="mx-auto mb-3 h-12 w-12 opacity-30" /><p>{search ? 'No transactions match your search.' : 'No transactions yet. Record your first sale or stock purchase.'}</p></div> : filtered.map(batch => {
          const first = batch.items[0], multiple = batch.items.length > 1, isExpanded = expanded.has(batch.id);
          const mixed = batch.items.some(item => item.type !== first.type);
          const details = <><div className="flex items-center gap-2">{multiple && (isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-subtle" /> : <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />)}<span className="font-semibold text-sm text-ink break-words">{multiple ? `${batch.items.length} products` : first.productName}</span></div><p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle"><span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{first.date ? new Date(first.date).toLocaleString() : 'Date unavailable'}</span>{!multiple && <span className="font-mono">{first.productSku}</span>}</p>{multiple && <p className="mt-1 truncate text-xs text-subtle">{batch.items.map(item => item.productName).join(', ')}</p>}</>;
          return <div key={batch.id}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 p-5 hover:bg-muted/30 transition-colors">
              {multiple ? <button type="button" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} order ${batch.id}`} aria-expanded={isExpanded} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(batch.id)) next.delete(batch.id); else next.add(batch.id); return next; })} className="min-w-0 flex-1 basis-52 text-left">{details}</button> : <div className="min-w-0 flex-1 basis-52">{details}</div>}
              <div className="min-w-24 max-w-44 text-sm text-body truncate">{first.buyerName || 'No buyer'}</div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${mixed || first.type === 'In' ? 'bg-muted text-body' : 'bg-brand-soft text-brand-ink'}`}>{mixed ? 'Mixed order' : first.type === 'Out' ? 'Sale' : 'Stock in'}</span>
              <div className="text-right sm:min-w-32"><p className="text-sm font-semibold tabular-nums text-ink">{formatMoney(batch.total)}</p>{!multiple && <p className="mt-1 text-xs text-subtle">{first.qtyChange} × {formatMoney(first.unitPrice)}</p>}</div>
              {actions(batch.items, 'batch')}
            </div>
            {multiple && isExpanded && <div className="border-t border-line bg-muted/25 px-4 sm:px-6 divide-y divide-line/60">{batch.items.map((item, index) => <div key={item.id} className="flex flex-wrap items-center gap-3 py-4">
              <span className="text-xs text-subtle w-5">{index + 1}</span><div className="min-w-0 flex-1 basis-40"><p className="text-sm font-medium text-ink break-words">{item.productName}</p><p className="mt-1 text-xs text-subtle">{item.productSku} · {item.type === 'Out' ? 'Sale' : 'Stock in'}</p></div><div className="text-right text-xs text-subtle"><p>{item.qtyChange} × {formatMoney(item.unitPrice)}</p><p className="mt-1 text-sm font-semibold text-body tabular-nums">{formatMoney(item.total)}</p></div>{actions([item], 'item')}
            </div>)}{first.description && <p className="py-3 text-xs text-subtle whitespace-pre-wrap break-words">Note: {first.description}</p>}</div>}
          </div>;
        })}
      </div>
    </div>
    <TransactionModal isOpen={recording} onClose={() => setRecording(false)} onSuccess={message => { setNotice(message); void mutate(); }} />
    {(target || recoveryOpen && pending) && <TransactionCorrectionModal key={target ? `${target.mode}-${target.scope}-${target.items[0].id}` : 'recovery'} target={target} pending={pending} onClose={close} onSubmit={submit} />}
  </div>;
}
