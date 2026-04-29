'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Plus, Inbox, Loader2, Calendar, Edit, Trash2, CheckCircle, XCircle, ChevronDown, ChevronRight, Package } from 'lucide-react';
import TransactionModal from '@/components/TransactionModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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

const postToAPI = async (payload: object) => {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('HTTP error: ' + res.status);
  return res.json();
};

const inputClass = 'w-full bg-base-900 border border-base-800 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white';

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
    API_URL ? API_URL + '?action=transactions' : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  const transactions: Transaction[] = response?.data || [];
  const batches = groupByBatch(transactions);

  const error = !API_URL
    ? 'NEXT_PUBLIC_API_URL is not set.'
    : swrError
    ? swrError.message
    : response && !response.success
    ? response.message
    : '';

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [eQty, setEQty] = useState('');
  const [ePrice, setEPrice] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eBuyer, setEBuyer] = useState('');

  useEffect(() => { setMounted(true); }, []);

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

  const openEdit = (t: Transaction) => {
    setEditTx(t);
    setEQty(String(t.qtyChange));
    setEPrice(String(t.unitPrice));
    setEDesc(t.description || '');
    setEBuyer(t.buyerName || '');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTx) return;
    setEditLoading(true);
    try {
      const json = await postToAPI({
        action: 'update_transaction',
        transactionId: editTx.id,
        qtyChange: eQty,
        unitPrice: ePrice,
        description: eDesc,
        buyerName: eBuyer,
      });
      if (json.success) {
        showToast('Transaction updated!', 'success');
        setEditTx(null);
        mutate();
      } else {
        showToast(json.message || 'Update failed.', 'error');
      }
    } catch (err) {
      showToast('Connection failed.', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item from the transaction?')) return;
    try {
      const json = await postToAPI({ action: 'delete_transaction', transactionId: id });
      if (json.success) {
        showToast('Item deleted!', 'success');
        mutate();
      } else {
        showToast(json.message || 'Delete failed.', 'error');
      }
    } catch (err) {
      showToast('Connection failed.', 'error');
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-base-950 border border-base-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-base-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Transaction History</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Multi-product orders are grouped as a single transaction</p>
          </div>
          <button
            onClick={() => setIsTxModalOpen(true)}
            className="flex items-center gap-2 bg-white hover:bg-neutral-200 text-black px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Record Transaction
          </button>
        </div>

        <div className="divide-y divide-base-800">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">{error}</div>
          ) : batches.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No transactions yet. Click Record Transaction to add one.</p>
            </div>
          ) : (
            batches.map((batch) => {
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
                    <div className="flex-1 min-w-0">
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

                    {/* Actions - only for single-item batches */}
                    {!isMulti && (
                      <div className="w-16 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openEdit(firstItem)} className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(firstItem.id)} className="p-1.5 text-red-500 hover:text-red-300 hover:bg-red-950/30 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {isMulti && <div className="w-16" />}
                  </div>

                  {/* Expanded item rows */}
                  {isMulti && isExpanded && (
                    <div className="bg-base-900/30 border-t border-base-800/50">
                      {batch.items.map((item, idx) => (
                        <div key={item.id} className={`flex items-center gap-4 px-6 py-3 text-sm group/item ${idx !== batch.items.length - 1 ? 'border-b border-base-800/30' : ''}`}>
                          <div className="w-5 shrink-0" />
                          <div className="w-44 shrink-0 text-neutral-600 text-xs">Item {idx + 1}</div>
                          <div className="flex-1 min-w-0">
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
                          <div className="w-16 flex items-center justify-end gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(item)} className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-500 hover:text-red-300 hover:bg-red-950/30 rounded-lg transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {/* Batch subtotal footer */}
                      <div className="flex items-center gap-4 px-6 py-3 border-t border-base-800/50 bg-base-900/50">
                        <div className="w-5 shrink-0" />
                        <div className="w-44 shrink-0" />
                        <div className="flex-1 text-xs text-neutral-500">
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
            })
          )}
        </div>
      </div>

      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        onSuccess={(msg) => { showToast(msg, 'success'); mutate(); }}
      />

      {/* Edit Transaction Modal */}
      {editTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditTx(null)} />
          <div className="relative w-full max-w-md bg-base-950 border border-base-800 rounded-2xl shadow-2xl z-10 mx-4">
            <div className="flex items-center justify-between p-5 border-b border-base-800 bg-base-900/50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-white">Edit Item</h3>
                <p className="text-xs text-neutral-500 mt-0.5">{editTx.productName} - {editTx.type === 'Out' ? 'Sale' : 'Stock In'}</p>
              </div>
              <button onClick={() => setEditTx(null)} className="text-neutral-400 hover:text-white p-1">x</button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1.5">Quantity</label>
                  <input required type="number" min="1" value={eQty} onChange={(e) => setEQty(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1.5">Unit Price ($)</label>
                  <input required type="number" step="0.01" min="0" value={ePrice} onChange={(e) => setEPrice(e.target.value)} className={inputClass} />
                </div>
              </div>
              {editTx.type === 'Out' && (
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1.5">Buyer Name</label>
                  <input type="text" value={eBuyer} onChange={(e) => setEBuyer(e.target.value)} className={inputClass} placeholder="Customer name" />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-1.5">Description</label>
                <input type="text" value={eDesc} onChange={(e) => setEDesc(e.target.value)} className={inputClass} placeholder="Optional note" />
              </div>
              <div className="p-3 bg-yellow-950/20 border border-yellow-900/50 rounded-lg">
                <p className="text-xs text-yellow-400">Note: Editing updates the record only. Stock levels are not recalculated.</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditTx(null)} className="flex-1 bg-base-900 hover:bg-base-800 text-white py-2.5 rounded-lg font-bold border border-base-800">Cancel</button>
                <button type="submit" disabled={editLoading} className="flex-1 bg-white hover:bg-neutral-200 disabled:opacity-60 text-black py-2.5 rounded-lg font-bold flex items-center justify-center gap-2">
                  {editLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>) : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border fade-in ${toast.type === 'success' ? 'bg-base-900 border-white/20 text-white' : 'bg-red-950/90 border-red-900 text-red-300'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
          <p className="text-sm font-bold">{toast.msg}</p>
        </div>
      )}
    </div>
  );
}
