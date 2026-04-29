import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeftRight, X, Loader2, Plus, Trash2, Search } from 'lucide-react';
import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const fetcher = async (url: string) => {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  return res.json();
};

type Product = {
  uuid: string;
  sku: string;
  name: string;
  quantity: number;
  buyPrice: number;
  salePrice: number;
};

type LineItem = {
  id: number;
  productUuid: string;
  searchQuery: string; // Temporary search text
  type: 'Out' | 'In';
  qtyChange: string;
  unitPrice: string;
};

const selectClass = 'w-full bg-base-900 border border-base-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white appearance-none';
const inputClass = 'w-full bg-base-900 border border-base-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white placeholder-neutral-600';

let lineIdCounter = 1;

function makeItem(): LineItem {
  return { id: lineIdCounter++, productUuid: '', searchQuery: '', type: 'Out', qtyChange: '1', unitPrice: '' };
}

export default function TransactionModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const { data: dashboardRes, isLoading: dataLoading } = useSWR(
    isOpen && API_URL ? `${API_URL}?action=dashboard` : null,
    fetcher
  );
  
  const products: Product[] = useMemo(() => 
    Array.isArray(dashboardRes?.data?.products) ? dashboardRes.data.products : []
  , [dashboardRes]);

  const [items, setItems] = useState<LineItem[]>([makeItem()]);
  const [buyerName, setBuyerName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setItems([makeItem()]);
      setBuyerName('');
      setDescription('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Auto-fill price when product or type changes
  const updateItem = (id: number, changes: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...changes };

        // Handle searchable product selection via datalist/searchQuery
        if (changes.searchQuery !== undefined) {
          // Check if the query matches exactly a product (sku or name)
          const matched = products.find(p => 
            p.name === updated.searchQuery || 
            p.sku === updated.searchQuery ||
            `[${p.sku}] ${p.name}` === updated.searchQuery
          );
          if (matched) {
            updated.productUuid = matched.uuid;
            updated.unitPrice = updated.type === 'Out' ? String(matched.salePrice) : String(matched.buyPrice);
          } else if (!updated.searchQuery) {
            updated.productUuid = '';
          }
        }

        // Auto-fill unit price when type changes
        if (changes.type !== undefined && updated.productUuid) {
          const p = products.find((pr) => pr.uuid === updated.productUuid);
          if (p) {
            updated.unitPrice = updated.type === 'Out' ? String(p.salePrice) : String(p.buyPrice);
          }
        }
        
        return updated;
      })
    );
  };

  const addItem = () => setItems((prev) => [...prev, makeItem()]);

  const removeItem = (id: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const getProduct = (uuid: string) => products.find((p) => p.uuid === uuid);

  const grandTotal = items.reduce((sum, item) => {
    const qty = Number(item.qtyChange) || 0;
    const price = Number(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(val);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate all items have a product selected
    for (let i = 0; i < items.length; i++) {
      if (!items[i].productUuid) {
        setError(`Please select a valid product for item #${i + 1}. Use the dropdown to choose.`);
        return;
      }
      if (!items[i].unitPrice || Number(items[i].unitPrice) < 0) {
        setError(`Please enter a valid price for item #${i + 1}.`);
        return;
      }
    }

    if (!API_URL) {
      setError('API URL not configured in .env.local');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        action: 'batch_transaction',
        buyerName,
        description,
        items: items.map((item) => ({
          productUuid: item.productUuid,
          type: item.type,
          qtyChange: Number(item.qtyChange),
          unitPrice: Number(item.unitPrice),
        })),
      };

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        onSuccess(json.message || 'Transaction recorded!');
        onClose();
      } else {
        setError(json.message || 'Transaction failed.');
      }
    } catch (err) {
      setError('Connection failed. Check your API URL and deployment settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-base-950 border border-base-800 rounded-2xl shadow-2xl z-10 mx-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-base-800 bg-base-900/50 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <ArrowLeftRight className="w-6 h-6 text-black" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">Record Transaction</h3>
              <p className="text-xs text-neutral-500">Add multiple items to a single batch order</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-xl font-bold flex items-center gap-3">
                <XCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            {/* Line Items */}
            <div className="space-y-4">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_90px_80px_110px_100px_32px] gap-3 px-1">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Search Product</span>
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Type</span>
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-center">Qty</span>
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Price</span>
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-right">Subtotal</span>
                <span />
              </div>

              {items.map((item, idx) => {
                const prod = getProduct(item.productUuid);
                const subtotal = (Number(item.qtyChange) || 0) * (Number(item.unitPrice) || 0);
                const stockWarning = prod && item.type === 'Out' && Number(item.qtyChange) > prod.quantity;

                return (
                  <div key={item.id} className="group/row">
                    <div className="grid grid-cols-[1fr_90px_80px_110px_100px_32px] gap-3 items-center">
                      {/* Product Search */}
                      <div className="relative">
                        <input
                          required
                          type="text"
                          autoComplete="off"
                          value={item.searchQuery}
                          onChange={(e) => updateItem(item.id, { searchQuery: e.target.value })}
                          className={`${inputClass} !pl-9`}
                          placeholder={dataLoading ? "Loading..." : "SKU or Name..."}
                          list={`products-list-${item.id}`}
                        />
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                        <datalist id={`products-list-${item.id}`}>
                          {products.map((p) => (
                            <option key={p.uuid} value={`[${p.sku}] ${p.name}`} />
                          ))}
                        </datalist>
                      </div>

                      {/* Type toggle */}
                      <select
                        value={item.type}
                        onChange={(e) => updateItem(item.id, { type: e.target.value as 'Out' | 'In' })}
                        className={selectClass}
                      >
                        <option value="Out">Sale</option>
                        <option value="In">Stock In</option>
                      </select>

                      {/* Qty */}
                      <input
                        required
                        type="number"
                        min="1"
                        value={item.qtyChange}
                        onChange={(e) => updateItem(item.id, { qtyChange: e.target.value })}
                        className={`${inputClass} text-center`}
                      />

                      {/* Unit Price */}
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">PKR</span>
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })}
                          className={`${inputClass} !pl-10`}
                        />
                      </div>

                      {/* Subtotal */}
                      <div className="text-right text-sm font-bold text-white tabular-nums">
                        {formatCurrency(subtotal)}
                      </div>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="p-1.5 text-neutral-600 hover:text-red-400 disabled:opacity-0 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Meta info & warnings */}
                    <div className="flex justify-between items-center px-1 mt-1">
                      <div>
                        {stockWarning && (
                          <p className="text-[10px] text-yellow-400 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Warning: Only {prod!.quantity} units left
                          </p>
                        )}
                        {prod && !stockWarning && (
                          <p className="text-[10px] text-neutral-500">Available: {prod.quantity} units</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add item button */}
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white border border-dashed border-base-700 hover:border-white/20 rounded-xl px-4 py-3 transition-all w-full justify-center bg-base-900/20"
            >
              <Plus className="w-4 h-4" /> Add Another Product
            </button>

            {/* Shared fields */}
            <div className="border-t border-base-800 pt-6 grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">
                  Client Name <span className="text-neutral-600 font-normal italic">(optional)</span>
                </label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">
                  Reference / Note <span className="text-neutral-600 font-normal italic">(optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Bulk order, Invoice #123"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-base-800 bg-base-900/50 rounded-b-2xl shrink-0">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Items Count</p>
                <p className="text-lg font-bold text-white">{items.length} Product{items.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Grand Total</p>
                <p className="text-3xl font-black text-white tabular-nums leading-none mt-1">{formatCurrency(grandTotal)}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-base-900 hover:bg-base-800 text-white py-3 rounded-xl font-bold transition-all border border-base-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-white hover:bg-neutral-200 disabled:opacity-70 text-black py-3 rounded-xl font-bold transition-all shadow-xl flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Processing...
                  </>
                ) : (
                  `Confirm Transaction`
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function XCircle(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
  );
}

function AlertTriangle(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
  );
}
