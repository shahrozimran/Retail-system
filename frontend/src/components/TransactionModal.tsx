import Dialog from '@/components/Dialog';
import { errorMessage } from '@/lib/errors';
import { API_URL, PROXY, apiFetch as fetch } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import React, { useState, useMemo } from 'react';
import { ArrowLeftRight, X, Loader2, Plus, Trash2, Search } from 'lucide-react';
import useSWR, { mutate } from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  return res.json();
};

type Product = {
  uuid: string;
  sku: string;
  name: string;
  quantity: number;
  potentialQuantity?: number;
  buyPrice: number;
  salePrice: number;
};

type Customer = {
  uuid: string;
  name: string;
  balance: number;
  phone: string;
};

type LineItem = {
  id: number;
  productUuid: string;
  searchQuery: string;
  type: 'Out' | 'In';
  qtyChange: string;
  unitPrice: string;
};

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

const selectClass = 'w-full bg-muted border border-line rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-line focus:ring-1 focus:ring-brand appearance-none';
const inputClass = 'w-full bg-muted border border-line rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-line focus:ring-1 focus:ring-brand placeholder-subtle';

/** Removes leading zeros so "01" becomes "1", but keeps "0.5" intact. */
const sanitizeNum = (val: string) => val.replace(/^0+(?=\d)/, '');

function makeItem(id: number): LineItem {
  return { id, productUuid: '', searchQuery: '', type: 'Out', qtyChange: '1', unitPrice: '' };
}

type Props = { isOpen: boolean; onClose: () => void; onSuccess: (msg: string) => void };
export default function TransactionModal(props: Props) {
  return props.isOpen ? <TransactionContent {...props} /> : null;
}
function TransactionContent({ isOpen, onClose, onSuccess }: Props) {
  const { data: dashboardRes, isLoading: dataLoading } = useSWR(
    isOpen && API_URL ? `${PROXY}?action=dashboard` : null,
    fetcher
  );

  const { data: customersRes } = useSWR(
    isOpen && API_URL ? `${PROXY}?action=customers` : null,
    fetcher
  );

  const products: Product[] = useMemo(() =>
    Array.isArray(dashboardRes?.data?.products) ? dashboardRes.data.products : []
  , [dashboardRes]);

  const customers: Customer[] = useMemo(() =>
    Array.isArray(customersRes?.data) ? customersRes.data : []
  , [customersRes]);

  const [items, setItems] = useState<LineItem[]>(() => [makeItem(1)]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextId, setNextId] = useState(2);

  const query = customerSearch.toLowerCase();
  const selectedCustomer = customers.find(c => c.name.toLowerCase() === query || `[${c.phone || 'No Phone'}] ${c.name}`.toLowerCase() === query);
  const customerUuid = selectedCustomer?.uuid || '';
  const buyerName = selectedCustomer?.name || customerSearch;

  const updateItem = (id: number, changes: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...changes };

        if (changes.searchQuery !== undefined) {
          const query = updated.searchQuery.toLowerCase();
          const matched = products.find(p => {
            const pName = String(p.name || '').toLowerCase();
            const pSku = String(p.sku || '').toLowerCase();
            return pName === query || pSku === query || `[${p.sku}] ${p.name}`.toLowerCase() === query;
          });
          if (matched) {
            updated.productUuid = matched.uuid;
            updated.unitPrice = updated.type === 'Out' ? String(matched.salePrice) : String(matched.buyPrice);
          } else if (!updated.searchQuery) {
            updated.productUuid = '';
          }
        }

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

  const addItem = () => {
    setItems((prev) => [...prev, makeItem(nextId)]);
    setNextId(prev => prev + 1);
  };

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

  const formatCurrency = formatMoney;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

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

    const payload = {
      action: 'batch_transaction',
      customerUuid,
      buyerName,
      description,
      items: items.map((item) => ({
        productUuid: item.productUuid,
        type: item.type,
        qtyChange: Number(item.qtyChange),
        unitPrice: Number(item.unitPrice),
      })),
    };

    const batchId = 'temp-batch-' + crypto.randomUUID();
    const dateStr = new Date().toISOString();
    const optimisticTxItems: Transaction[] = items.map((item) => {
      const prod = products.find(p => p.uuid === item.productUuid);
      const qty = Number(item.qtyChange);
      const price = Number(item.unitPrice);
      return {
        id: 'temp-' + crypto.randomUUID(),
        date: dateStr,
        productUuid: item.productUuid,
        productName: prod ? prod.name : 'Unknown Product',
        productSku: prod ? prod.sku : '',
        type: item.type,
        qtyChange: qty,
        unitPrice: price,
        total: qty * price,
        description: description,
        buyerName: buyerName,
        batchId: batchId
      };
    });

    const updatePromise = fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Transaction failed');
      return json;
    });

    try {
      const txKey = PROXY + '?action=transactions';

      await mutate(
        txKey,
        updatePromise.then(() => {
          return undefined; // Trigger normal background fetch and cache update
        }),
        {
          optimisticData: (currentRes: { data?: Transaction[]; success?: boolean } | undefined) => {
            const currentList = Array.isArray(currentRes?.data) ? currentRes.data : [];
            return {
              ...currentRes,
              data: [...optimisticTxItems, ...currentList]
            };
          },
          rollbackOnError: true,
          revalidate: true
        }
      );

      // Mutate dashboard and customers as well to refresh their stocks/balances
      mutate(`${PROXY}?action=dashboard`);
      mutate(`${PROXY}?action=customers`);

      onSuccess('Transaction recorded!');
      onClose();
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Connection failed. Check your API URL and deployment settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog onClose={onClose} label="Record transaction" className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={onClose} />
      <div className="modal-panel relative w-full max-w-3xl bg-surface border border-line rounded-2xl shadow-dialog z-10 mx-4 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-line bg-muted/50 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center">
              <ArrowLeftRight className="w-6 h-6 text-on-brand" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ink leading-tight">Record Transaction</h3>
              <p className="text-xs text-subtle">Add multiple items to a single batch order</p>
            </div>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink transition-colors p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 p-6 space-y-6">
            {error && (
              <div className="p-4 bg-danger-soft border border-danger/20 text-danger text-sm rounded-xl font-semibold flex items-center gap-3">
                <XCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="hidden md:grid grid-cols-[1fr_90px_80px_110px_100px_32px] gap-3 px-1">
                <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Search Product</span>
                <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Type</span>
                <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide text-center">Qty</span>
                <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Price</span>
                <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide text-right">Subtotal</span>
                <span />
              </div>

              {items.map((item, index) => {
                const prod = getProduct(item.productUuid);
                const subtotal = (Number(item.qtyChange) || 0) * (Number(item.unitPrice) || 0);
                const stockWarning = prod && item.type === 'Out' && Number(item.qtyChange) > prod.quantity;

                return (
                  <div key={item.id} className="group/row rounded-xl border border-line p-3 md:p-0 md:border-0">
                    <div className="grid grid-cols-2 md:grid-cols-[1fr_90px_80px_110px_100px_32px] gap-3 items-end md:items-center">
                      <div className="relative col-span-2 md:col-span-1 min-w-0">
                        <label className="md:hidden field-label" htmlFor={`transaction-product-${item.id}`}>Product</label>
                        <div className="relative">
                        <input
                          id={`transaction-product-${item.id}`}
                          aria-label={`Product ${index + 1}`}
                          required
                          type="text"
                          autoComplete="off"
                          value={item.searchQuery}
                          onChange={(e) => updateItem(item.id, { searchQuery: e.target.value })}
                          className={`${inputClass} !pl-9`}
                          placeholder={dataLoading ? "Loading..." : "SKU or Name..."}
                          list={`products-list-${item.id}`}
                        />
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
                        </div>
                        <datalist id={`products-list-${item.id}`}>
                          {products.map((p) => (
                            <option key={p.uuid} value={`[${p.sku}] ${p.name}`} />
                          ))}
                        </datalist>
                      </div>

                      <div><label className="md:hidden field-label" htmlFor={`transaction-type-${item.id}`}>Type</label><select
                        id={`transaction-type-${item.id}`}
                        aria-label={`Transaction type ${index + 1}`}
                        value={item.type}
                        onChange={(e) => updateItem(item.id, { type: e.target.value as 'Out' | 'In' })}
                        className={selectClass}
                      >
                        <option value="Out">Sale</option>
                        <option value="In">Stock In</option>
                      </select></div>

                      <div><label className="md:hidden field-label" htmlFor={`transaction-quantity-${item.id}`}>Quantity</label><input
                        id={`transaction-quantity-${item.id}`}
                        aria-label={`Quantity ${index + 1}`}
                        required
                        type="number"
                        min="1"
                        value={item.qtyChange}
                        onChange={(e) => updateItem(item.id, { qtyChange: sanitizeNum(e.target.value) })}
                        className={`${inputClass} text-center`}
                      /></div>

                      <div><label className="md:hidden field-label" htmlFor={`transaction-price-${item.id}`}>Unit price</label><div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle text-xs">PKR</span>
                        <input
                          id={`transaction-price-${item.id}`}
                          aria-label={`Unit price ${index + 1}`}
                          required
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, { unitPrice: sanitizeNum(e.target.value) })}
                          className={`${inputClass} !pl-10`}
                        />
                      </div></div>

                      <div className="text-right text-sm font-semibold text-ink tabular-nums">
                        <span className="md:hidden text-xs text-subtle block mb-2 font-normal">Subtotal</span>
                        {formatCurrency(subtotal)}
                      </div>

                      <button
                        type="button"
                        aria-label={`Remove product ${index + 1}`}
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="p-1.5 text-subtle hover:text-danger disabled:opacity-30 transition-all justify-self-end col-start-2 md:col-start-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex justify-between items-center px-1 mt-1">
                      <div>
                        {stockWarning && (
                          <p className="text-[11px] text-warning font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning-soft" /> Warning: Insufficient stock ({prod.quantity} in stock)
                          </p>
                        )}
                        {prod && (
                          <div className="flex items-center gap-3 mt-0.5">
                            <p className="text-[11px] text-subtle uppercase font-semibold tracking-tight">Stock: <span className="text-body font-mono">{prod.quantity}</span></p>
                            <p className="text-[11px] text-subtle uppercase font-semibold tracking-tight">Potential: <span className="text-success font-mono">{prod.potentialQuantity || 0}</span></p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 text-sm font-semibold text-subtle hover:text-ink border border-dashed border-line hover:border-line rounded-xl px-4 py-3 transition-all w-full justify-center bg-muted/20"
            >
              <Plus className="w-4 h-4" /> Add Another Product
            </button>

            <div className="border-t border-line pt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-subtle uppercase tracking-wide mb-2">
                  Customer / Buyer Name
                </label>
                <div className="relative">
                  <input aria-label="Customer / Buyer Name"
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className={`${inputClass} !pl-9`}
                    placeholder="Search existing or type new..."
                    list="customers-datalist"
                  />
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
                  <datalist id="customers-datalist">
                    {customers.map(c => (
                      <option key={c.uuid} value={`[${c.phone || 'No Phone'}] ${c.name}`} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-subtle uppercase tracking-wide mb-2">
                  Reference / Note <span className="text-subtle font-normal italic">(optional)</span>
                </label>
                <input aria-label="Reference / Note"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Bulk order, Invoice #123"
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-line bg-muted/50 rounded-b-2xl shrink-0">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs text-subtle font-semibold uppercase tracking-wide">Items Count</p>
                <p className="text-lg font-semibold text-ink">{items.length} Product{items.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="text-right">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-4 text-xs text-subtle font-semibold uppercase tracking-wide">
                    <span>Subtotal:</span>
                    <span className="text-ink tabular-nums">{formatCurrency(grandTotal)}</span>
                  </div>
                  <div className="h-px w-32 bg-emphasis my-1" />
                  <p className="text-xs text-subtle font-semibold uppercase tracking-wide">Grand Total</p>
                  <p className="text-3xl font-semibold text-ink tabular-nums leading-none mt-1">
                    {formatCurrency(grandTotal)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-muted hover:bg-emphasis text-ink py-3 rounded-xl font-semibold transition-all border border-line"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-brand hover:bg-brand-hover disabled:opacity-70 text-on-brand py-3 rounded-xl font-semibold transition-all shadow-panel flex items-center justify-center gap-2"
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
    </Dialog>
  );
}

function XCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
  );
}
