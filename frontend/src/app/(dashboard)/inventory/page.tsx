'use client';

import React, { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { Search, Plus, Tag, Inbox, Loader2, CheckCircle, XCircle, Edit, Trash2, AlertTriangle } from 'lucide-react';

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

const inputClass =
  'w-full bg-base-900 border border-base-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white';

export default function Inventory() {
  const { data: response, isLoading, error: fetchError, mutate } = useSWR(
    API_URL ? `${API_URL}?action=dashboard` : null,
    fetcher,
    { shouldRetryOnError: false }
  );
  
  // Safe extraction with Array check
  const products: Product[] = Array.isArray(response?.data?.products) ? response.data.products : [];

  // Get unique categories for suggestions
  const existingCategories = useMemo(() => {
    const cats = products.map(p => p.category).filter(Boolean);
    return Array.from(new Set(cats)).sort();
  }, [products]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productModalMode, setProductModalMode] = useState<'add' | 'edit'>('add');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [pUuid, setPUuid] = useState('');
  const [pSku, setPSku] = useState('');
  const [pName, setPName] = useState('');
  const [pCat, setPCat] = useState('');
  const [pBuy, setPBuy] = useState('');
  const [pSale, setPSale] = useState('');
  const [pQty, setPQty] = useState('');
  const [pMin, setPMin] = useState('10');
  const [pStatus, setPStatus] = useState('Active');
  const [pRawMaterials, setPRawMaterials] = useState<RawMaterial[]>([]);
  const [pLoading, setPLoading] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openAddProduct = () => {
    setProductModalMode('add');
    setPUuid(''); setPSku(''); setPName(''); setPCat('');
    setPBuy(''); setPSale(''); setPQty(''); setPMin('10');
    setPStatus('Active');
    setPRawMaterials([]);
    setIsProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setProductModalMode('edit');
    setPUuid(p.uuid); setPSku(p.sku); setPName(p.name); setPCat(p.category);
    setPBuy(String(p.buyPrice)); setPSale(String(p.salePrice));
    setPQty(String(p.quantity)); setPMin(String(p.minStock));
    setPStatus(p.status);
    setPRawMaterials(p.rawMaterials || []);
    setIsProductModalOpen(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!API_URL) { showToast('API URL not configured in .env.local', 'error'); return; }
    setPLoading(true);
    const payload = {
      action: productModalMode === 'add' ? 'add_product' : 'update_product',
      productUuid: pUuid, sku: pSku, name: pName, category: pCat,
      buyPrice: pBuy, salePrice: pSale, quantity: 0, minStock: pMin,
      status: pStatus,
      rawMaterials: pRawMaterials,
    };
    try {
      const json = await postToAPI(payload);
      if (json.success) {
        showToast(`Product ${productModalMode === 'add' ? 'added' : 'updated'} successfully!`, 'success');
        setIsProductModalOpen(false);
        mutate();
      } else {
        showToast(json.message || 'Action failed.', 'error');
      }
    } catch (err) {
      showToast('Connection failed. Check your API URL and deployment settings.', 'error');
    } finally {
      setPLoading(false);
    }
  };

  const handleDelete = async (uuid: string) => {
    if (!confirm('Delete this product permanently?')) return;
    if (!API_URL) { showToast('API URL not configured.', 'error'); return; }
    try {
      const json = await postToAPI({ action: 'delete_product', productUuid: uuid });
      if (json.success) {
        showToast('Product deleted!', 'success');
        mutate();
      } else {
        showToast(json.message || 'Delete failed.', 'error');
      }
    } catch (err) {
      showToast('Connection failed. Check your API URL.', 'error');
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(val);

  const potentialProduction = useMemo(() => {
    if (!pRawMaterials || pRawMaterials.length === 0) return 0;
    let minPossible = Infinity;
    pRawMaterials.forEach(rm => {
      if (rm.requiredPerProduct > 0) {
        const possible = Math.floor(rm.quantity / rm.requiredPerProduct);
        if (possible < minPossible) minPossible = possible;
      }
    });
    return minPossible === Infinity ? 0 : minPossible;
  }, [pRawMaterials]);

  const filteredProducts = products.filter((p) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const name = String(p.name || '').toLowerCase();
    const sku = String(p.sku || '').toLowerCase();
    const category = String(p.category || '').toLowerCase();
    const status = String(p.status || '').toLowerCase();
    return name.includes(q) || sku.includes(q) || category.includes(q) || status.includes(q);
  });

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-neutral-500" />
        <p className="text-neutral-500 font-medium">Syncing inventory data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      {!API_URL && (
        <div className="flex items-center gap-3 bg-yellow-950/40 border border-yellow-900 text-yellow-300 rounded-xl px-5 py-3.5 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p><strong>NEXT_PUBLIC_API_URL</strong> is not set in <code>.env.local</code>. Add your Google Apps Script URL and restart the dev server.</p>
        </div>
      )}
      {fetchError && API_URL && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-900 text-red-300 rounded-xl px-5 py-3.5 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>
            <strong>Cannot connect to Google Apps Script.</strong> Make sure the Web App is deployed with &ldquo;Execute as: Me&rdquo; and &ldquo;Who has access: Anyone&rdquo;.{' '}
            <button onClick={() => mutate()} className="underline font-bold">Retry</button>
          </p>
        </div>
      )}

      <div className="bg-base-950 border border-base-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-base-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Inventory</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products, SKU, or category..."
                className="pl-9 pr-4 py-2 bg-base-900 border border-base-800 rounded-lg text-sm text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white w-full sm:w-64"
              />
            </div>
            <button onClick={openAddProduct} className="flex items-center gap-2 bg-white hover:bg-neutral-200 text-black px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-base-900 text-neutral-400 text-xs uppercase tracking-wider border-b border-base-800">
                <th className="px-6 py-4 font-bold">Product</th>
                <th className="px-6 py-4 font-bold w-24">SKU</th>
                <th className="px-6 py-4 font-bold w-28">Buy Price</th>
                <th className="px-6 py-4 font-bold w-28">Sale Price</th>
                <th className="px-6 py-4 text-center">Actual Stock</th>
                <th className="px-6 py-4 text-center">Potential</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 font-bold text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-800 text-sm">
              {filteredProducts.map((p) => (
                <tr key={p.uuid} className="hover:bg-base-900/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-base-900 border border-base-800 flex items-center justify-center text-neutral-500 group-hover:text-white transition-colors shrink-0">
                        <Tag className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-white">{p.name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-neutral-500">{p.category}</p>
                          {p.rawMaterials && p.rawMaterials.length > 0 && (
                            <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">
                              {p.rawMaterials.length} Raw Materials
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-neutral-300 font-mono text-xs">{p.sku}</td>
                  <td className="px-6 py-4 text-neutral-400">{formatCurrency(p.buyPrice)}</td>
                  <td className="px-6 py-4 text-white font-medium">{formatCurrency(p.salePrice)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-sm font-bold ${p.quantity <= p.minStock ? 'text-red-400' : 'text-white'}`}>
                      {p.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-xs text-neutral-500 font-mono">
                      {p.potentialQuantity}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                      p.status === 'Low Stock' ? 'bg-yellow-950/30 text-yellow-400 border-yellow-900' :
                      p.status === 'Out of Stock' ? 'bg-red-950/30 text-red-400 border-red-900' :
                      p.status === 'Inactive' || p.status === 'Discontinued' ? 'bg-neutral-800 text-neutral-500 border-neutral-700' :
                      'bg-white/10 text-white border-white/20'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditProduct(p)} title="Edit" className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p.uuid)} title="Delete" className="p-2 text-red-500 hover:text-red-300 hover:bg-red-950/30 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="p-12 text-center text-neutral-500">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{searchTerm ? 'No products match your search.' : 'No products yet. Click "Add Product" to get started.'}</p>
            </div>
          )}
        </div>
      </div>

      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsProductModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-base-950 border border-base-800 rounded-2xl shadow-2xl z-10 mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-base-800 bg-base-900/50 rounded-t-2xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5" />
                {productModalMode === 'add' ? 'Add New Product' : 'Edit Product'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-neutral-400 hover:text-white transition-colors p-1">x</button>
            </div>
            <form onSubmit={handleProductSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1.5">SKU <span className="text-red-400">*</span></label>
                  <input required type="text" value={pSku} onChange={(e) => setPSku(e.target.value)} className={inputClass} placeholder="e.g. AB-001" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1.5">Category <span className="text-red-400">*</span></label>
                  <input 
                    required type="text" 
                    value={pCat} 
                    onChange={(e) => setPCat(e.target.value)} 
                    className={inputClass} 
                    placeholder="e.g. Clothing" 
                    list="category-suggestions"
                  />
                  <datalist id="category-suggestions">
                    {existingCategories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-1.5">Product Name <span className="text-red-400">*</span></label>
                <input required type="text" value={pName} onChange={(e) => setPName(e.target.value)} className={inputClass} placeholder="e.g. Blue Abaya" />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-1.5">Product Status</label>
                <select 
                  value={pStatus} 
                  onChange={(e) => setPStatus(e.target.value)} 
                  className={inputClass}
                >
                  <option value="Active">Active (Auto-Stock)</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Discontinued">Discontinued</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1.5">Buy Price (PKR) <span className="text-red-400">*</span></label>
                  <input required type="number" step="0.01" min="0" value={pBuy} onChange={(e) => setPBuy(e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1.5">Sale Price (PKR) <span className="text-red-400">*</span></label>
                  <input required type="number" step="0.01" min="0" value={pSale} onChange={(e) => setPSale(e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1.5">Min Stock Alert</label>
                  <input required type="number" min="0" value={pMin} onChange={(e) => setPMin(e.target.value)} className={inputClass} placeholder="10" />
                </div>
                <div className="flex flex-col justify-end pb-1">
                  <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 flex items-center justify-between">
                    <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Potential Production</span>
                    <span className={`text-lg font-bold ${potentialProduction === 0 ? 'text-red-400' : 'text-white'}`}>
                      {potentialProduction}
                    </span>
                  </div>
                </div>
              </div>

              {/* Raw Materials Section */}
              <div className="space-y-4 pt-2 border-t border-base-800">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-white">Raw Materials Composition</label>
                  <button 
                    type="button" 
                    onClick={() => setPRawMaterials([...pRawMaterials, { name: '', quantity: 0, requiredPerProduct: 0 }])}
                    className="text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2.5 py-1.5 rounded-lg border border-neutral-700 flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Material
                  </button>
                </div>
                
                {pRawMaterials.length > 0 ? (
                  <div className="space-y-3">
                    {pRawMaterials.map((rm, idx) => (
                      <div key={idx} className="bg-base-900/50 border border-base-800 p-3 rounded-xl space-y-3 relative group/rm">
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-6">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-1 block">Material Name</label>
                            <input 
                              required 
                              type="text" 
                              value={rm.name} 
                              onChange={(e) => {
                                const newRM = [...pRawMaterials];
                                newRM[idx].name = e.target.value;
                                setPRawMaterials(newRM);
                              }}
                              className="w-full bg-base-950 border border-base-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors"
                              placeholder="e.g. Fabric" 
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-1 block">Current Stock</label>
                            <input 
                              required 
                              type="number" 
                              min="0"
                              step="0.01"
                              value={rm.quantity} 
                              onChange={(e) => {
                                const newRM = [...pRawMaterials];
                                newRM[idx].quantity = Number(e.target.value);
                                setPRawMaterials(newRM);
                              }}
                              className="w-full bg-base-950 border border-base-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors"
                              placeholder="0" 
                            />
                          </div>
                          <div className="col-span-3 text-right">
                             <button 
                              type="button" 
                              onClick={() => setPRawMaterials(pRawMaterials.filter((_, i) => i !== idx))}
                              className="text-neutral-500 hover:text-red-400 transition-colors mt-6"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-1 block">Required per Product</label>
                            <input 
                              required 
                              type="number" 
                              min="0"
                              step="0.01"
                              value={rm.requiredPerProduct} 
                              onChange={(e) => {
                                const newRM = [...pRawMaterials];
                                newRM[idx].requiredPerProduct = Number(e.target.value);
                                setPRawMaterials(newRM);
                              }}
                              className="w-full bg-base-950 border border-base-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white transition-colors"
                              placeholder="0.00" 
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 border-2 border-dashed border-base-900 rounded-xl">
                    <p className="text-xs text-neutral-500">No raw materials added yet.</p>
                  </div>
                )}
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 bg-base-900 hover:bg-base-800 text-white py-2.5 rounded-lg font-bold transition-colors border border-base-800">
                  Cancel
                </button>
                <button type="submit" disabled={pLoading} className="flex-1 bg-white hover:bg-neutral-200 disabled:opacity-60 text-black py-2.5 rounded-lg font-bold transition-colors shadow-lg flex items-center justify-center gap-2">
                  {pLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Product'}
                </button>
              </div>
            </form>
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
