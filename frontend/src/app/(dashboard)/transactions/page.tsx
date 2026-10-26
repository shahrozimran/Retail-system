'use client';
import PageHeading from '@/components/PageHeading';
import SummaryStrip from '@/components/SummaryStrip';
import { useMounted } from '@/hooks/useMounted';
import { API_URL, PROXY, apiFetch as fetch } from '@/lib/api';
import { formatMoney } from '@/lib/money';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Inbox, Loader2, Calendar, CheckCircle, XCircle, ChevronDown, ChevronRight, Package, Search } from 'lucide-react';
import TransactionModal from '@/components/TransactionModal';


type Transaction = {
  id: string;
  date: string;
  productUuid: string;
  productName: string;
  productSku: string;
  type: string;
  qtyChange: number;
  unitPrice: number;
  total: number;
  description: string;
  buyerName: string;
  batchId: string;
};

type BatchGroup = {
  batchId: string;
  date: string;
  buyerName: string;
  description: string;
  type: string;
  items: Transaction[];
  grandTotal: number;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP error: ' + res.status);
  return res.json();
};

function groupByBatch(transactions: Transaction[]): BatchGroup[] {
  const map = new Map<string, BatchGroup>();
  for (const t of transactions) {
    const key = t.batchId || t.id;
    if (!map.has(key)) {
      map.set(key, {
        batchId: key,
        date: t.date,
        buyerName: t.buyerName,
        description: t.description,
        type: t.type,
        items: [],
        grandTotal: 0,
      });
    }
    const group = map.get(key)!;
    group.items.push(t);
    group.grandTotal += t.total;
  }
  return Array.from(map.values());
}

export default function Transactions() {
  const { data: response, error: swrError, isLoading, mutate } = useSWR(
    API_URL ? PROXY + '?action=transactions' : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  const transactions: Transaction[] = response?.data || [];
  const batches = groupByBatch(transactions);

  const error = !API_URL
    ? 'NEXT_PUBLIC_API_ORIGIN is not set.'
    : swrError
    ? swrError.message
    : response && !response.success
    ? response.message
    : '';

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const mounted = useMounted();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');


  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const formatCurrency = formatMoney;

  const filteredBatches = batches.filter((batch) => {
    if (typeFilter !== 'all' && !batch.items.some(item => item.type === typeFilter)) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const batchId = String(batch.batchId || '').toLowerCase();
    const buyerName = String(batch.buyerName || '').toLowerCase();
    const description = String(batch.description || '').toLowerCase();
    const productNames = batch.items.map(i => String(i.productName || '').toLowerCase()).join(' ');
    const productSkus = batch.items.map(i => String(i.productSku || '').toLowerCase()).join(' ');

    return batchId.includes(q) || buyerName.includes(q) || description.includes(q) || productNames.includes(q) || productSkus.includes(q);
  });

  return (
    <div className="space-y-6 fade-in">
      <PageHeading title="Transactions" description="A clear record of every sale and stock movement." />
      <SummaryStrip items={[{ label: 'Recorded transactions', value: batches.length }, { label: 'Total sales', value: formatCurrency(transactions.filter(t => t.type === 'Out').reduce((sum, t) => sum + t.total, 0)) }, { label: 'Total stock purchases', value: formatCurrency(transactions.filter(t => t.type === 'In').reduce((sum, t) => sum + t.total, 0)) }]} />
      <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Transaction history</h2>
            <p className="text-xs text-subtle mt-0.5">Posted transactions are preserved. Record a separate transaction for adjustments.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by buyer, product, or SKU..."
                className="pl-9 pr-4 py-2 bg-muted border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-line focus:ring-1 focus:ring-brand w-full sm:w-64"
              />
            </div>
            <button
              onClick={() => setIsTxModalOpen(true)}
              className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-on-brand px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Record Transaction
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 px-5 py-3 border-b border-line bg-muted/40" aria-label="Filter transaction type">{[['all', 'All activity'], ['Out', 'Sales'], ['In', 'Stock in']].map(([value, label]) => <button key={value} onClick={() => setTypeFilter(value)} aria-pressed={typeFilter === value} className={`px-3 py-1.5 rounded-md text-xs font-medium ${typeFilter === value ? 'bg-brand-soft text-brand-ink' : 'text-subtle hover:bg-emphasis'}`}>{label}</button>)}</div>
        <div className="divide-y divide-line overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-subtle" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-danger">{error}</div>
          ) : filteredBatches.length === 0 ? (
            <div className="p-12 text-center text-subtle">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{searchTerm ? 'No transactions match your search.' : 'No transactions yet. Click Record Transaction to add one.'}</p>
            </div>
          ) : (
            <div className="min-w-[800px]">
              {filteredBatches.map((batch) => {
              const isMulti = batch.items.length > 1;
              const isExpanded = expandedBatches.has(batch.batchId);
              const firstItem = batch.items[0];

              return (
                <div key={batch.batchId} className="group">
                  {/* Batch summary row */}
                  <div
                    className={`flex items-center gap-4 px-6 py-4 hover:bg-muted/40 transition-colors ${isMulti ? 'cursor-pointer' : ''}`}
                    onClick={() => isMulti && toggleBatch(batch.batchId)}
                  >
                    {/* Expand toggle */}
                    <div className="w-5 shrink-0">
                      {isMulti ? (
                        isExpanded
                          ? <ChevronDown className="w-4 h-4 text-subtle" />
                          : <ChevronRight className="w-4 h-4 text-subtle" />
                      ) : (
                        <span />
                      )}
                    </div>

                    {/* Date */}
                    <div className="w-44 shrink-0 text-sm text-subtle flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      {firstItem.date ? (mounted ? new Date(firstItem.date).toLocaleString() : '...') : '-'}
                    </div>

                    {/* Products summary */}
                    <div className="w-80 grow min-w-0">
                      {isMulti ? (
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-subtle shrink-0" />
                          <span className="font-semibold text-ink text-sm">{batch.items.length} products</span>
                          <span className="text-xs text-subtle truncate">
                            {batch.items.map((i) => i.productName).join(', ')}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <p className="font-semibold text-ink text-sm">{firstItem.productName}</p>
                          <p className="text-xs text-subtle font-mono">{firstItem.productSku}</p>
                        </div>
                      )}
                    </div>

                    {/* Buyer */}
                    <div className="w-28 shrink-0 text-sm text-ink font-medium truncate">
                      {batch.buyerName || <span className="text-subtle">-</span>}
                    </div>

                    {/* Type badge */}
                    <div className="w-20 shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${firstItem.type === 'In' ? 'bg-muted text-body border-line' : 'bg-brand text-on-brand border-line'}`}>
                        {firstItem.type === 'Out' ? 'Sale' : 'Stock In'}
                      </span>
                    </div>

                    {/* Grand total */}
                    <div className="w-24 text-right font-semibold text-ink tabular-nums text-sm">
                      {formatCurrency(batch.grandTotal)}
                    </div>

                    <div className="w-16 text-xs text-subtle">Posted</div>
                  </div>

                  {/* Expanded item rows */}
                  {isMulti && isExpanded && (
                    <div className="bg-muted/30 border-t border-line/50">
                      {batch.items.map((item, idx) => (
                        <div key={item.id} className={`flex items-center gap-4 px-6 py-3 text-sm group/item ${idx !== batch.items.length - 1 ? 'border-b border-line/30' : ''}`}>
                          <div className="w-5 shrink-0" />
                          <div className="w-44 shrink-0 text-subtle text-xs">Item {idx + 1}</div>
                          <div className="w-80 grow min-w-0">
                            <p className="font-medium text-ink">{item.productName}</p>
                            <p className="text-xs text-subtle font-mono">{item.productSku}</p>
                          </div>
                          <div className="w-28 shrink-0" />
                          <div className="w-20 shrink-0 text-subtle text-xs tabular-nums">
                            {item.qtyChange} x {formatCurrency(item.unitPrice)}
                          </div>
                          <div className="w-24 text-right font-medium text-body tabular-nums">
                            {formatCurrency(item.total)}
                          </div>
                          <div className="w-16" />
                        </div>
                      ))}
                      {/* Batch subtotal footer */}
                      <div className="flex items-center gap-4 px-6 py-3 border-t border-line/50 bg-muted/50">
                        <div className="w-5 shrink-0" />
                        <div className="w-44 shrink-0" />
                        <div className="w-80 grow text-xs text-subtle">
                          {batch.description && <span>Note: {batch.description}</span>}
                        </div>
                        <div className="w-28 shrink-0" />
                        <div className="w-20 shrink-0 text-xs text-subtle text-right">Order total</div>
                        <div className="w-24 text-right font-semibold text-ink tabular-nums">{formatCurrency(batch.grandTotal)}</div>
                        <div className="w-16" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        onSuccess={(msg) => { showToast(msg, 'success'); mutate(); }}
      />

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-dialog border fade-in ${toast.type === 'success' ? 'bg-muted border-line text-ink' : 'bg-danger-soft border-danger/20 text-danger'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-success shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
          <p className="text-sm font-semibold">{toast.msg}</p>
        </div>
      )}
    </div>
  );
}
