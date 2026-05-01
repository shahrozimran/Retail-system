'use client';

import React, { useState, useMemo } from 'react';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
};

const inputClass = 'w-full bg-base-950 border border-base-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all';

export default function Production() {
  // Fetch Products for selection
  const { data: dashboardData, isLoading: productsLoading, mutate: mutateInventory } = useSWR(
    API_URL ? `${API_URL}?action=dashboard` : null,
    fetcher
  );

  // Fetch Production History
  const { data: historyResponse, isLoading: historyLoading, mutate: mutateHistory } = useSWR(
    API_URL ? `${API_URL}?action=productions` : null,
    fetcher
  );

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

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
    if (Number(qtyToProduce) <= 0) {
      showToast("Please enter a valid quantity", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const json = await postToAPI({
        action: 'process_production',
        productUuid: selectedProduct.uuid,
        qtyProduced: Number(qtyToProduce)
      });

      if (json.success) {
        showToast("Production recorded and inventory updated!", "success");
        setQtyToProduce('1');
        setSelectedProduct(null);
        setSearchTerm('');
        mutateInventory();
        mutateHistory();
      } else {
        showToast(json.message || "Failed to record production", "error");
      }
    } catch (err) {
      showToast("Connection failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(val);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6 fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Factory className="w-6 h-6" />
            Production
          </h2>
          <p className="text-neutral-500 text-sm">Convert raw materials into finished goods.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Production Form */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-base-950 border border-base-800 rounded-2xl p-6 shadow-xl space-y-6">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider text-neutral-400">
              <Plus className="w-4 h-4" /> New Production Run
            </h3>

            {/* Product Search */}
            <div className="relative">
              <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Select Main Product</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (selectedProduct) setSelectedProduct(null);
                  }}
                  placeholder="Search inventory..."
                  className="pl-10 pr-4 py-3 bg-base-900 border border-base-800 rounded-xl text-sm text-white focus:outline-none focus:border-white w-full transition-all"
                />
              </div>

              {searchTerm && !selectedProduct && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-base-950 border border-base-800 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-base-800">
                  {filteredProducts.map(p => (
                    <button
                      key={p.uuid}
                      onClick={() => {
                        setSelectedProduct(p);
                        setSearchTerm(p.name);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <p className="text-xs text-neutral-500 font-mono">{p.sku}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-600" />
                    </button>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="px-4 py-3 text-sm text-neutral-500">No products found</div>
                  )}
                </div>
              )}
            </div>

            {selectedProduct && (
              <div className="bg-base-900/40 border border-base-800 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-bold">{selectedProduct.name}</h4>
                    <p className="text-xs text-neutral-500">{selectedProduct.category}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <div>
                      <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest leading-none">In Stock</p>
                      <p className="text-lg font-bold text-white leading-none">{selectedProduct.quantity}</p>
                    </div>
                    <div className="mt-1">
                      <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest leading-none">Can Make</p>
                      <p className={`text-lg font-bold ${selectedProduct.potentialQuantity === 0 ? 'text-red-400' : 'text-green-400'} leading-none`}>
                        {selectedProduct.potentialQuantity}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-base-800">
                  <label className="block text-xs font-bold text-neutral-500 mb-3 uppercase tracking-wide">Composition (Materials Used)</label>
                  <div className="space-y-2">
                    {selectedProduct.rawMaterials?.map((rm, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">{rm.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-500">{rm.requiredPerProduct} per unit</span>
                          <span className="text-neutral-300 font-bold bg-base-900 px-1.5 py-0.5 rounded border border-base-800">
                            {rm.quantity} in stock
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-base-800 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Qty to Produce</label>
                      <input
                        type="number"
                        min="1"
                        max={selectedProduct.potentialQuantity}
                        value={qtyToProduce}
                        onChange={(e) => setQtyToProduce(e.target.value)}
                        className="w-full bg-base-950 border border-base-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white transition-all text-center text-lg font-bold"
                      />
                    </div>
                    <div className="flex items-end h-full pt-6">
                      <ArrowRight className="w-6 h-6 text-neutral-700" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-neutral-500 mb-2 uppercase tracking-wide">Total Cost Est.</label>
                      <div className="px-4 py-3 bg-base-950 border border-base-800 rounded-xl text-center">
                        <p className="text-sm font-bold text-white">
                          {formatCurrency(Number(qtyToProduce) * selectedProduct.buyPrice)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleRecordProduction}
                    disabled={isSubmitting || Number(qtyToProduce) <= 0 || Number(qtyToProduce) > selectedProduct.potentialQuantity}
                    className="w-full bg-white hover:bg-neutral-200 disabled:opacity-40 text-black py-4 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Factory className="w-5 h-5" /> Record Production</>}
                  </button>

                  {Number(qtyToProduce) > selectedProduct.potentialQuantity && (
                    <p className="text-center text-red-400 text-xs font-bold">Insufficient raw materials for this quantity.</p>
                  )}
                </div>
              </div>
            )}

            {!selectedProduct && !searchTerm && (
              <div className="py-12 text-center text-neutral-600 border-2 border-dashed border-base-900 rounded-2xl">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Search and select a product to start production.</p>
              </div>
            )}
          </div>
        </div>

        {/* History Table */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-base-950 border border-base-800 rounded-2xl overflow-hidden shadow-xl h-[400px] flex flex-col">
            <div className="p-5 border-b border-base-800 bg-base-900/50 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider text-neutral-400">
                <History className="w-4 h-4" /> Production History
              </h3>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-base-900 text-neutral-500 text-[10px] uppercase tracking-widest font-bold border-b border-base-800">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4 text-center">Qty</th>
                    <th className="px-6 py-4 text-right">Total Cost</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-800">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-500" />
                      </td>
                    </tr>
                  ) : history?.map((rec: ProductionRecord) => (
                    <tr key={rec.id} className="group hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setSelectedRecord(rec)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                          <p className="text-xs text-neutral-300 font-mono">{formatDate(rec.date)}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-white">{rec.productName}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-neutral-800 text-white text-xs font-bold px-2 py-0.5 rounded border border-neutral-700">
                          {rec.qtyProduced}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-bold text-white">{formatCurrency(rec.qtyProduced * rec.costPerUnit)}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-neutral-500 group-hover:text-white transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!historyLoading && (!history || history.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-neutral-600">
                        No production history found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-base-950 border border-base-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
            <div className="p-5 border-b border-base-800 bg-base-900/50 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider text-neutral-400">
                <Layers className="w-4 h-4" /> Current Stock Overview
              </h3>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {products.slice(0, 8).map((p) => (
                <div key={p.uuid} className="p-3 bg-base-900/40 border border-base-800 rounded-xl space-y-1">
                  <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest truncate">{p.name}</p>
                  <div className="flex items-end justify-between">
                    <p className="text-xl font-black text-white leading-none">{p.quantity}</p>
                    <p className="text-[10px] text-neutral-600 font-mono">{p.sku}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedRecord(null)} />
          <div className="relative w-full max-w-lg bg-base-950 border border-base-800 rounded-2xl shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-base-800 bg-base-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Info className="w-5 h-5 text-neutral-400" />
                Production Details
              </h3>
              <button onClick={() => setSelectedRecord(null)} className="text-neutral-500 hover:text-white text-xl">&times;</button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 mb-1 block">Product</label>
                  <p className="text-lg font-bold text-white">{selectedRecord?.productName}</p>
                </div>
                <div className="text-right">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 mb-1 block">Date</label>
                  <p className="text-sm text-neutral-300">{selectedRecord ? formatDate(selectedRecord.date) : ''}</p>
                </div>
              </div>

              <div className="bg-base-900/50 border border-base-800 rounded-xl p-4 divide-y divide-base-800">
                <div className="pb-4">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 mb-3 block">Raw Materials Consumed</label>
                  <div className="space-y-3">
                    {selectedRecord?.rawMaterialsUsed.map((rm, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                          <span className="text-sm text-neutral-300">{rm.name}</span>
                        </div>
                        <span className="text-sm font-bold text-white font-mono">{rm.qtyUsed}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Production Qty</span>
                    <span className="text-white font-bold">{selectedRecord?.qtyProduced} units</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-500">Unit Cost (BOM)</span>
                    <span className="text-white font-bold">{selectedRecord ? formatCurrency(selectedRecord.costPerUnit) : ''}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm font-bold text-white">Total Production Cost</span>
                    <span className="text-xl font-bold text-white">
                      {selectedRecord ? formatCurrency(selectedRecord.qtyProduced * selectedRecord.costPerUnit) : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 mb-1 block">Est. Sales Value</label>
                  <p className="text-lg font-bold text-white">
                    {selectedRecord ? formatCurrency(selectedRecord.qtyProduced * selectedRecord.salePerUnit) : ''}
                  </p>
                </div>
                <div className="text-right">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-green-500/50 mb-1 block">Est. Profit Margin</label>
                  <p className="text-lg font-bold text-green-400">
                    {selectedRecord ? formatCurrency((selectedRecord.salePerUnit - selectedRecord.costPerUnit) * selectedRecord.qtyProduced) : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 bg-base-900/50 border-t border-base-800 text-center">
              <button
                onClick={() => setSelectedRecord(null)}
                className="w-full bg-white/5 hover:bg-white/10 text-white py-2.5 rounded-xl text-sm font-bold transition-all border border-white/10"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border fade-in ${
          toast.type === 'success' ? 'bg-base-900 border-white/20 text-white' : 'bg-red-950/90 border-red-900 text-red-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
          <p className="text-sm font-bold">{toast.msg}</p>
        </div>
      )}
    </div>
  );
}
