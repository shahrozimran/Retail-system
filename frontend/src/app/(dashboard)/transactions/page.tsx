'use client';
import { useMounted } from '@/hooks/useMounted';
import { API_URL, PROXY, apiFetch as fetch } from '@/lib/api';

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

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(val);

  const filteredBatches = batches.filter((batch) => {
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
      <div className="bg-base-950 border border-base-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-base-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Transaction History</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Posted transactions are preserved. Record a separate transaction for adjustments.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by buyer, product, or SKU..."
                className="pl-9 pr-4 py-2 bg-base-900 border border-base-800 rounded-lg text-sm text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white w-full sm:w-64"
              />
            </div>
            <button
              onClick={() => setIsTxModalOpen(true)}
              className="flex items-center gap-2 bg-white hover:bg-neutral-200 text-black px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Record Transaction
            </button>
          </div>
        </div>

        <div className="divide-y divide-base-800 overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">{error}</div>
          ) : filteredBatches.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
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
                    className={`flex items-center gap-4 px-6 py-4 hover:bg-base-900/40 transition-colors ${isMulti ? 'cursor-pointer' : ''}`}
                    onClick={() => isMulti && toggleBatch(batch.batchId)}
                  >
                    {/* Expand toggle */}
                    <div className="w-5 shrink-0">
                      {isMulti ? (
                        isExpanded
                          ? <ChevronDown className="w-4 h-4 text-neutral-400" />
                          : <ChevronRight className="w-4 h-4 text-neutral-400" />
                      ) : (
                        <span />
                      )}
                    </div>

                    {/* Date */}
                    <div className="w-44 shrink-0 text-sm text-neutral-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      {firstItem.date ? (mounted ? new Date(firstItem.date).toLocaleString() : '...') : '-'}
                    </div>

                    {/* Products summary */}
                    <div className="w-80 grow min-w-0">
                      {isMulti ? (
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-neutral-500 shrink-0" />
                          <span className="font-bold text-white text-sm">{batch.items.length} products</span>
                          <span className="text-xs text-neutral-500 truncate">
                            {batch.items.map((i) => i.productName).join(', ')}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <p className="font-bold text-white text-sm">{firstItem.productName}</p>
                          <p className="text-xs text-neutral-500 font-mono">{firstItem.productSku}</p>
                        </div>
                      )}
                    </div>

                    {/* Buyer */}
                    <div className="w-28 shrink-0 text-sm text-white font-medium truncate">
                      {batch.buyerName || <span className="text-neutral-600">-</span>}
                    </div>

                    {/* Type badge */}
                    <div className="w-20 shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${firstItem.type === 'In' ? 'bg-neutral-900 text-neutral-300 border-neutral-700' : 'bg-white text-black border-white'}`}>
                        {firstItem.type === 'Out' ? 'Sale' : 'Stock In'}
                      </span>
                    </div>

                    {/* Grand total */}
                    <div className="w-24 text-right font-bold text-white tabular-nums text-sm">
                      {formatCurrency(batch.grandTotal)}
                    </div>

                    <div className="w-16 text-xs text-neutral-600">Posted</div>
                  </div>

                  {/* Expanded item rows */}
                  {isMulti && isExpanded && (
                    <div className="bg-base-900/30 border-t border-base-800/50">
                      {batch.items.map((item, idx) => (
                        <div key={item.id} className={`flex items-center gap-4 px-6 py-3 text-sm group/item ${idx !== batch.items.length - 1 ? 'border-b border-base-800/30' : ''}`}>
                          <div className="w-5 shrink-0" />
                          <div className="w-44 shrink-0 text-neutral-600 text-xs">Item {idx + 1}</div>
                          <div className="w-80 grow min-w-0">
                            <p className="font-medium text-white">{item.productName}</p>
                            <p className="text-xs text-neutral-500 font-mono">{item.productSku}</p>
                          </div>
                          <div className="w-28 shrink-0" />
                          <div className="w-20 shrink-0 text-neutral-400 text-xs tabular-nums">
                            {item.qtyChange} x {formatCurrency(item.unitPrice)}
                          </div>
                          <div className="w-24 text-right font-medium text-neutral-300 tabular-nums">
                            {formatCurrency(item.total)}
                          </div>
                          <div className="w-16" />
                        </div>
                      ))}
                      {/* Batch subtotal footer */}
                      <div className="flex items-center gap-4 px-6 py-3 border-t border-base-800/50 bg-base-900/50">
                        <div className="w-5 shrink-0" />
                        <div className="w-44 shrink-0" />
                        <div className="w-80 grow text-xs text-neutral-500">
                          {batch.description && <span>Note: {batch.description}</span>}
                        </div>
                        <div className="w-28 shrink-0" />
                        <div className="w-20 shrink-0 text-xs text-neutral-500 text-right">Order total</div>
                        <div className="w-24 text-right font-bold text-white tabular-nums">{formatCurrency(batch.grandTotal)}</div>
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
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border fade-in ${toast.type === 'success' ? 'bg-base-900 border-white/20 text-white' : 'bg-red-950/90 border-red-900 text-red-300'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
          <p className="text-sm font-bold">{toast.msg}</p>
        </div>
      )}
    </div>
  );
}
