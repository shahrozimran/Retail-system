'use client';
import Dialog from '@/components/Dialog';
import PageHeading from '@/components/PageHeading';
import SummaryStrip from '@/components/SummaryStrip';
import DataNotice from '@/components/DataNotice';
import { useMounted } from '@/hooks/useMounted';
import { errorMessage } from '@/lib/errors';
import { API_URL, PROXY, apiFetch as fetch } from '@/lib/api';
import { formatMoney } from '@/lib/money';

import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Search,
  Factory,
  History,
  Plus,
  ArrowRight,
  Package,
  Layers,
  CheckCircle,
  XCircle,
  Loader2,
  Calendar,
  ChevronRight,
  Info
} from 'lucide-react';


type RawMaterial = {
  name: string;
  quantity: number;
  requiredPerProduct: number;
};

type Product = {
  uuid: string;
  sku: string;
  name: string;
  category: string;
  buyPrice: number;
  salePrice: number;
  quantity: number; // Actual Finished Stock
  potentialQuantity: number; // New: Potential to make
  minStock: number;
  status: string;
  rawMaterials?: RawMaterial[];
};

type ProductionRecord = {
  id: string;
  date: string;
  productUuid: string;
  productName: string;
  qtyProduced: number;
  rawMaterialsUsed: { name: string; qtyUsed: number }[];
  costPerUnit: number;
  salePerUnit: number;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
};

const postToAPI = async (payload: object) => {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
};


export default function Production() {
  // Fetch Products for selection
  const { data: dashboardData, error: productError, mutate: mutateInventory } = useSWR(
    API_URL ? `${PROXY}?action=dashboard` : null,
    fetcher
  );

  // Fetch Production History
  const { data: historyResponse, error: historyError, isLoading: historyLoading, mutate: mutateHistory } = useSWR(
    API_URL ? `${PROXY}?action=productions` : null,
    fetcher
  );

  const mounted = useMounted();

  const products: Product[] = dashboardData?.data?.products || [];
  const history: ProductionRecord[] = Array.isArray(historyResponse?.data) ? historyResponse.data : [];
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qtyToProduce, setQtyToProduce] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<ProductionRecord | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filteredProducts = products.filter(p => {
    const name = String(p.name || '').toLowerCase();
    const sku = String(p.sku || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    return name.includes(term) || sku.includes(term);
  }).slice(0, 5);

  const handleRecordProduction = async () => {
    if (!selectedProduct) return;
    const qtyProducedNum = Number(qtyToProduce);
    if (qtyProducedNum <= 0) {
      showToast("Please enter a valid quantity", "error");
      return;
    }

    setIsSubmitting(true);

    const updatedProducts = products.map((p) => {
      if (p.uuid === selectedProduct.uuid) {
        return {
          ...p,
          quantity: p.quantity + qtyProducedNum,
          potentialQuantity: Math.max(0, p.potentialQuantity - qtyProducedNum)
        };
      }
      return p;
    });

    const optimisticRecord: ProductionRecord = {
      id: 'temp-' + crypto.randomUUID(),
      date: new Date().toISOString(),
      productUuid: selectedProduct.uuid,
      productName: selectedProduct.name,
      qtyProduced: qtyProducedNum,
      rawMaterialsUsed: (selectedProduct.rawMaterials || []).map(rm => ({
        name: rm.name,
        qtyUsed: qtyProducedNum * rm.requiredPerProduct
      })),
      costPerUnit: selectedProduct.buyPrice,
      salePerUnit: selectedProduct.salePrice
    };

    const updatePromise = postToAPI({
      action: 'process_production',
      productUuid: selectedProduct.uuid,
      qtyProduced: qtyProducedNum
    }).then(res => {
      if (!res.success) throw new Error(res.message || "Failed to record production");
      return res;
    });

    // Reset inputs
    setQtyToProduce('1');
    setSelectedProduct(null);
    setSearchTerm('');

    try {
      // Mutate inventory (dashboard action)
      const invPromise = mutateInventory(
        updatePromise.then(() => undefined),
        {
          optimisticData: {
            ...dashboardData,
            data: {
              ...dashboardData?.data,
              products: updatedProducts
            }
          },
          rollbackOnError: true,
          revalidate: true
        }
      );

      // Mutate production history
      const histPromise = mutateHistory(
        updatePromise.then(() => undefined),
        {
          optimisticData: {
            ...historyResponse,
            data: [optimisticRecord, ...history]
          },
          rollbackOnError: true,
          revalidate: true
        }
      );

      await Promise.all([invPromise, histPromise]);
      showToast("Production recorded and inventory updated!", "success");
    } catch (err: unknown) {
      showToast(errorMessage(err) || "Connection failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = formatMoney;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6 fade-in pb-10">
      <PageHeading title="Production" description="Turn available materials into finished products, with every run accounted for." />
      {(productError || historyError) && <DataNotice onRetry={() => { mutateInventory(); mutateHistory(); }} />}
      <SummaryStrip items={[{ label: 'Products ready to produce', value: products.filter(p => p.potentialQuantity > 0).length }, { label: 'Recorded production runs', value: history.length }, { label: 'Total units produced', value: history.reduce((total, run) => total + run.qtyProduced, 0) }]} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Production Form */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-panel space-y-6">
            <h3 className="font-semibold text-ink flex items-center gap-2 text-sm uppercase tracking-wider text-subtle">
              <Plus className="w-4 h-4" /> New Production Run
            </h3>

            {/* Product Search */}
            <div className="relative">
              <label className="block text-xs font-semibold text-subtle mb-2 uppercase tracking-wide">Select Main Product</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input aria-label="Select Main Product"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (selectedProduct) setSelectedProduct(null);
                  }}
                  placeholder="Search inventory..."
                  className="pl-10 pr-4 py-3 bg-muted border border-line rounded-xl text-sm text-ink focus:outline-none focus:border-line w-full transition-all"
                />
              </div>

              {searchTerm && !selectedProduct && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-line rounded-xl shadow-dialog z-50 overflow-hidden divide-y divide-line">
                  {filteredProducts.map(p => (
                    <button
                      key={p.uuid}
                      onClick={() => {
                        setSelectedProduct(p);
                        setSearchTerm(p.name);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-emphasis/5 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">{p.name}</p>
                        <p className="text-xs text-subtle font-mono">{p.sku}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-subtle" />
                    </button>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="px-4 py-3 text-sm text-subtle">No products found</div>
                  )}
                </div>
              )}
            </div>

            {selectedProduct && (
              <div className="bg-muted/40 border border-line rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-ink font-semibold">{selectedProduct.name}</h4>
                    <p className="text-xs text-subtle">{selectedProduct.category}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <div>
                      <p className="text-[11px] text-subtle uppercase font-semibold tracking-wide leading-none">In Stock</p>
                      <p className="text-lg font-semibold text-ink leading-none">{selectedProduct.quantity}</p>
                    </div>
                    <div className="mt-1">
                      <p className="text-[11px] text-subtle uppercase font-semibold tracking-wide leading-none">Can Make</p>
                      <p className={`text-lg font-semibold ${selectedProduct.potentialQuantity === 0 ? 'text-danger' : 'text-success'} leading-none`}>
                        {selectedProduct.potentialQuantity}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-line">
                  <label className="block text-xs font-semibold text-subtle mb-3 uppercase tracking-wide">Composition (Materials Used)</label>
                  <div className="space-y-2">
                    {selectedProduct.rawMaterials?.map((rm, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-subtle">{rm.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-subtle">{rm.requiredPerProduct} per unit</span>
                          <span className="text-body font-semibold bg-muted px-1.5 py-0.5 rounded border border-line">
                            {rm.quantity} in stock
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-line space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-subtle mb-2 uppercase tracking-wide">Qty to Produce</label>
                      <input aria-label="Qty to Produce"
                        type="number"
                        min="1"
                        max={selectedProduct.potentialQuantity}
                        value={qtyToProduce}
                        onChange={(e) => setQtyToProduce(e.target.value.replace(/^0+(?=\d)/, ''))}
                        className="w-full bg-surface border border-line rounded-xl px-4 py-3 text-ink focus:outline-none focus:border-line transition-all text-center text-lg font-semibold"
                      />
                    </div>
                    <div className="flex items-end h-full pt-6">
                      <ArrowRight className="w-6 h-6 text-subtle" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-subtle mb-2 uppercase tracking-wide">Total Cost Est.</label>
                      <div className="px-4 py-3 bg-surface border border-line rounded-xl text-center">
                        <p className="text-sm font-semibold text-ink">
                          {formatCurrency(Number(qtyToProduce) * selectedProduct.buyPrice)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleRecordProduction}
                    disabled={isSubmitting || Number(qtyToProduce) <= 0 || Number(qtyToProduce) > selectedProduct.potentialQuantity}
                    className="w-full bg-brand hover:bg-brand-hover disabled:opacity-40 text-on-brand py-4 rounded-xl font-semibold transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Factory className="w-5 h-5" /> Record Production</>}
                  </button>

                  {Number(qtyToProduce) > selectedProduct.potentialQuantity && (
                    <p className="text-center text-danger text-xs font-semibold">Insufficient raw materials for this quantity.</p>
                  )}
                </div>
              </div>
            )}

            {!selectedProduct && !searchTerm && (
              <div className="py-12 text-center text-subtle border-2 border-dashed border-line rounded-2xl">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Search and select a product to start production.</p>
              </div>
            )}
          </div>
        </div>

        {/* History Table */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-panel h-[400px] flex flex-col">
            <div className="p-5 border-b border-line bg-muted/50 flex items-center justify-between">
              <h3 className="font-semibold text-ink flex items-center gap-2 text-sm uppercase tracking-wider text-subtle">
                <History className="w-4 h-4" /> Production History
              </h3>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted text-subtle text-[11px] uppercase tracking-wide font-semibold border-b border-line">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4 text-center">Qty</th>
                    <th className="px-6 py-4 text-right">Total Cost</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-subtle" />
                      </td>
                    </tr>
                  ) : history?.map((rec: ProductionRecord) => (
                    <tr key={rec.id} className="group hover:bg-emphasis/5 transition-colors cursor-pointer" onClick={() => setSelectedRecord(rec)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-3.5 h-3.5 text-subtle" />
                          <p className="text-xs text-body font-mono">{formatDate(rec.date)}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-ink">{rec.productName}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-emphasis text-ink text-xs font-semibold px-2 py-0.5 rounded border border-line">
                          {rec.qtyProduced}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-semibold text-ink">{formatCurrency(rec.qtyProduced * rec.costPerUnit)}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button aria-label={`View ${rec.productName} production details`} className="p-2 text-subtle group-hover:text-ink transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!historyLoading && (!history || history.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-subtle">
                        No production history found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-panel flex flex-col">
            <div className="p-5 border-b border-line bg-muted/50 flex items-center justify-between">
              <h3 className="font-semibold text-ink flex items-center gap-2 text-sm uppercase tracking-wider text-subtle">
                <Layers className="w-4 h-4" /> Current Stock Overview
              </h3>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {products.slice(0, 8).map((p) => (
                <div key={p.uuid} className="p-3 bg-muted/40 border border-line rounded-xl space-y-1">
                  <p className="text-[11px] text-subtle uppercase font-semibold tracking-wide truncate">{p.name}</p>
                  <div className="flex items-end justify-between">
                    <p className="text-xl font-semibold text-ink leading-none">{p.quantity}</p>
                    <p className="text-[11px] text-subtle font-mono">{p.sku}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedRecord && (
        <Dialog onClose={() => setSelectedRecord(null)} label="Production run details" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={() => setSelectedRecord(null)} />
          <div className="modal-panel relative w-full max-w-lg bg-surface border border-line rounded-2xl shadow-dialog z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-line bg-muted/50">
              <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Info className="w-5 h-5 text-subtle" />
                Production Details
              </h3>
              <button onClick={() => setSelectedRecord(null)} className="text-subtle hover:text-ink text-xl">&times;</button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[11px] uppercase tracking-wide font-semibold text-subtle mb-1 block">Product</label>
                  <p className="text-lg font-semibold text-ink">{selectedRecord?.productName}</p>
                </div>
                <div className="text-right">
                  <label className="text-[11px] uppercase tracking-wide font-semibold text-subtle mb-1 block">Date</label>
                  <p className="text-sm text-body">{selectedRecord ? formatDate(selectedRecord.date) : ''}</p>
                </div>
              </div>

              <div className="bg-muted/50 border border-line rounded-xl p-4 divide-y divide-line">
                <div className="pb-4">
                  <label className="text-[11px] uppercase tracking-wide font-semibold text-subtle mb-3 block">Raw Materials Consumed</label>
                  <div className="space-y-3">
                    {selectedRecord?.rawMaterialsUsed.map((rm, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emphasis" />
                          <span className="text-sm text-body">{rm.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-ink font-mono">{rm.qtyUsed}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Production Qty</span>
                    <span className="text-ink font-semibold">{selectedRecord?.qtyProduced} units</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-subtle">Unit Cost (BOM)</span>
                    <span className="text-ink font-semibold">{selectedRecord ? formatCurrency(selectedRecord.costPerUnit) : ''}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm font-semibold text-ink">Total Production Cost</span>
                    <span className="text-xl font-semibold text-ink">
                      {selectedRecord ? formatCurrency(selectedRecord.qtyProduced * selectedRecord.costPerUnit) : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-muted border border-line rounded-xl p-4 flex items-center justify-between">
                <div>
                  <label className="text-[11px] uppercase tracking-wide font-semibold text-subtle mb-1 block">Est. Sales Value</label>
                  <p className="text-lg font-semibold text-ink">
                    {selectedRecord ? formatCurrency(selectedRecord.qtyProduced * selectedRecord.salePerUnit) : ''}
                  </p>
                </div>
                <div className="text-right">
                  <label className="text-[11px] uppercase tracking-wide font-semibold text-success mb-1 block">Est. Profit Margin</label>
                  <p className="text-lg font-semibold text-success">
                    {selectedRecord ? formatCurrency((selectedRecord.salePerUnit - selectedRecord.costPerUnit) * selectedRecord.qtyProduced) : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 bg-muted/50 border-t border-line text-center">
              <button
                onClick={() => setSelectedRecord(null)}
                className="w-full bg-emphasis/5 hover:bg-emphasis/10 text-ink py-2.5 rounded-xl text-sm font-semibold transition-all border border-line"
              >
                Close Details
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-dialog border fade-in ${
          toast.type === 'success' ? 'bg-muted border-line text-ink' : 'bg-danger-soft border-danger/20 text-danger'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-success shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
          <p className="text-sm font-semibold">{toast.msg}</p>
        </div>
      )}
    </div>
  );
}
