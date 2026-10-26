'use client';
import Dialog from '@/components/Dialog';
import PageHeading from '@/components/PageHeading';
import SummaryStrip from '@/components/SummaryStrip';
import { errorMessage } from '@/lib/errors';
import { API_URL, PROXY, apiFetch as fetch } from '@/lib/api';
import { formatMoney } from '@/lib/money';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { Search, Plus, Tag, Inbox, Loader2, CheckCircle, XCircle, Edit, Trash2, AlertTriangle } from 'lucide-react';


type RawMaterial = {
  uuid?: string; // New: UUID from global list
  name: string;
  quantity: number; // Display snapshot from the normalized material record
  requiredPerProduct: number;
};

type RawMaterialDraft = Omit<RawMaterial, 'requiredPerProduct'> & {
  requiredPerProduct: string;
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
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  return res.json();
};

const inputClass =
  'w-full bg-muted border border-line rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:border-line focus:ring-1 focus:ring-brand';

/** Removes leading zeros so "01" becomes "1", but keeps "0.5" intact. */
const sanitizeNum = (val: string) => val.replace(/^0+(?=\d)/, '');

export default function Inventory() {
  const { data: response, isLoading, error: fetchError, mutate } = useSWR(
    API_URL ? `${PROXY}?action=dashboard` : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  const { data: rawResponse } = useSWR(
    API_URL ? `${PROXY}?action=raw_materials` : null,
    fetcher
  );

  const globalRawMaterials: { uuid: string; name: string; stock: number }[] = Array.isArray(rawResponse?.data) ? rawResponse.data : [];

  // Safe extraction with Array check
  const products: Product[] = useMemo(() => Array.isArray(response?.data?.products) ? response.data.products : [], [response]);

  // Get unique categories for suggestions
  const existingCategories = useMemo(() => {
    const cats = products.map(p => p.category).filter(Boolean);
    return Array.from(new Set(cats)).sort();
  }, [products]);

  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
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
  const [pRawMaterials, setPRawMaterials] = useState<RawMaterialDraft[]>([]);
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
    setPRawMaterials((p.rawMaterials || []).map(rm => ({ ...rm, requiredPerProduct: String(rm.requiredPerProduct) })));
    setIsProductModalOpen(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!API_URL) { showToast('API URL not configured in .env.local', 'error'); return; }
    setPLoading(true);
    const rawMaterials: RawMaterial[] = pRawMaterials.map(rm => ({ ...rm, requiredPerProduct: Number(rm.requiredPerProduct) }));
    const payload = {
      action: productModalMode === 'add' ? 'add_product' : 'update_product',
      productUuid: pUuid, sku: pSku, name: pName, category: pCat,
      buyPrice: Number(pBuy), salePrice: Number(pSale), quantity: Number(pQty) || 0, minStock: Number(pMin),
      status: pStatus,
      rawMaterials,
    };

    const tempUuid = pUuid || 'temp-' + crypto.randomUUID();
    const newProduct: Product = {
      uuid: tempUuid,
      sku: pSku,
      name: pName,
      category: pCat,
      buyPrice: Number(pBuy),
      salePrice: Number(pSale),
      quantity: Number(pQty) || 0,
      potentialQuantity: calculatePotentialProduction(),
      minStock: Number(pMin),
      status: pStatus,
      rawMaterials
    };

    const updatePromise = postToAPI(payload).then(res => {
      if (!res.success) throw new Error(res.message || 'Action failed');
      return res;
    });

    setIsProductModalOpen(false);

    try {
      if (productModalMode === 'add') {
        const updatedProducts = [...products, newProduct];
        await mutate(
          updatePromise.then(() => {
            return {
              ...response,
              data: {
                ...response?.data,
                products: [...products, { ...newProduct, uuid: 'loading...' }]
              }
            };
          }),
          {
            optimisticData: {
              ...response,
              data: {
                ...response?.data,
                products: updatedProducts
              }
            },
            rollbackOnError: true,
            revalidate: true
          }
        );
        showToast('Product added successfully!', 'success');
      } else {
        const updatedProducts = products.map(p => p.uuid === pUuid ? newProduct : p);
        await mutate(
          updatePromise.then(() => {
            return {
              ...response,
              data: {
                ...response?.data,
                products: updatedProducts
              }
            };
          }),
          {
            optimisticData: {
              ...response,
              data: {
                ...response?.data,
                products: updatedProducts
              }
            },
            rollbackOnError: true,
            revalidate: true
          }
        );
        showToast('Product updated successfully!', 'success');
      }
    } catch (err: unknown) {
      showToast(errorMessage(err) || 'Connection failed.', 'error');
    } finally {
      setPLoading(false);
    }
  };

  const handleDelete = async (uuid: string) => {
    if (!confirm('Delete this product permanently?')) return;
    if (!API_URL) { showToast('API URL not configured.', 'error'); return; }

    const updatePromise = postToAPI({ action: 'delete_product', productUuid: uuid }).then(res => {
      if (!res.success) throw new Error(res.message || 'Delete failed');
      return res;
    });

    try {
      const updatedProducts = products.filter(p => p.uuid !== uuid);
      await mutate(
        updatePromise.then(() => {
          return {
            ...response,
            data: {
              ...response?.data,
              products: updatedProducts
            }
          };
        }),
        {
          optimisticData: {
            ...response,
            data: {
              ...response?.data,
              products: updatedProducts
            }
          },
          rollbackOnError: true,
          revalidate: true
        }
      );
      showToast('Product deleted!', 'success');
    } catch (err: unknown) {
      showToast(errorMessage(err) || 'Connection failed.', 'error');
    }
  };

  const formatCurrency = formatMoney;

  const calculatePotentialProduction = () => {
    if (!pRawMaterials || pRawMaterials.length === 0) return 0;
    let minPossible = Infinity;

    pRawMaterials.forEach(rm => {
      const requiredPerProduct = Number(rm.requiredPerProduct);
      if (requiredPerProduct > 0) {
        // Find current stock from global list if UUID exists
        const globalRM = globalRawMaterials.find(g => g.uuid === rm.uuid);
        const stock = globalRM ? globalRM.stock : (rm.quantity || 0);

        const possible = Math.floor(stock / requiredPerProduct);
        if (possible < minPossible) minPossible = possible;
      }
    });
    return minPossible === Infinity ? 0 : minPossible;
  };
  const potentialProduction = calculatePotentialProduction();

  const filteredProducts = products.filter((p) => {
    if (stockFilter === 'low' && p.quantity > p.minStock) return false;
    if (stockFilter === 'inactive' && !['Inactive', 'Discontinued', 'Archived'].includes(p.status)) return false;
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
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
        <Loader2 className="w-10 h-10 animate-spin text-subtle" />
        <p className="text-subtle font-medium">Syncing inventory data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <PageHeading title="Inventory" description="Keep products, pricing and stock levels in order." />
      <SummaryStrip items={[{ label: 'Products in catalog', value: products.length }, { label: 'At or below minimum stock', value: products.filter(p => p.quantity <= p.minStock).length }, { label: 'Product categories', value: existingCategories.length }]} />
      {!API_URL && (
        <div className="flex items-center gap-3 bg-warning-soft border border-warning/20 text-warning rounded-xl px-5 py-3.5 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p><strong>NEXT_PUBLIC_API_ORIGIN</strong> is not set in <code>.env.local</code>. Add the hosted HTTPS application origin and rebuild the Android app.</p>
        </div>
      )}
      {fetchError && API_URL && (
        <div className="flex items-center gap-3 bg-danger-soft border border-danger/20 text-danger rounded-xl px-5 py-3.5 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>
            <strong>Cannot load inventory.</strong> Confirm that the Supabase migrations are installed and your session is valid.{' '}
            <button onClick={() => mutate()} className="underline font-semibold">Retry</button>
          </p>
        </div>
      )}

      <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-[15px] font-semibold text-ink">Product catalog <span className="ml-2 text-xs text-subtle font-normal">{filteredProducts.length} products</span></h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products, SKU, or category..."
                className="pl-9 pr-4 py-2 bg-muted border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-line focus:ring-1 focus:ring-brand w-full sm:w-64"
              />
            </div>
            <button onClick={openAddProduct} className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-on-brand px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-line bg-muted/40">
          <div className="flex gap-1" aria-label="Filter products by status">{[['all', 'All products'], ['low', 'Low stock'], ['inactive', 'Inactive']].map(([value, label]) => <button key={value} onClick={() => setStockFilter(value)} aria-pressed={stockFilter === value} className={`px-3 py-1.5 rounded-md text-xs font-medium ${stockFilter === value ? 'bg-brand-soft text-brand-ink' : 'text-subtle hover:bg-emphasis'}`}>{label}</button>)}</div>
          <select aria-label="Filter by category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-surface border border-line rounded-lg px-3 py-1.5 text-xs text-body"><option value="all">All categories</option>{existingCategories.map(category => <option key={category}>{category}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-muted text-subtle text-xs uppercase tracking-wider border-b border-line">
                <th className="px-6 py-4 font-semibold">Product</th>
                <th className="px-6 py-4 font-semibold w-24">SKU</th>
                <th className="px-6 py-4 font-semibold w-28">Buy Price</th>
                <th className="px-6 py-4 font-semibold w-28">Sale Price</th>
                <th className="px-6 py-4 text-center">Actual Stock</th>
                <th className="px-6 py-4 text-center">Potential</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-sm">
              {filteredProducts.map((p) => (
                <tr key={p.uuid} className="hover:bg-muted/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted border border-line flex items-center justify-center text-subtle group-hover:text-ink transition-colors shrink-0">
                        <Tag className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-ink">{p.name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-subtle">{p.category}</p>
                          {p.rawMaterials && p.rawMaterials.length > 0 && (
                            <span className="text-[11px] bg-emphasis text-subtle px-1.5 py-0.5 rounded border border-line">
                              {p.rawMaterials.length} Raw Materials
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-body font-mono text-xs">{p.sku}</td>
                  <td className="px-6 py-4 text-subtle">{formatCurrency(p.buyPrice)}</td>
                  <td className="px-6 py-4 text-ink font-medium">{formatCurrency(p.salePrice)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-sm font-semibold ${p.quantity <= p.minStock ? 'text-danger' : 'text-ink'}`}>
                      {p.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-xs text-subtle font-mono">
                      {p.potentialQuantity}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      p.status === 'Low Stock' ? 'bg-warning-soft text-warning border-warning/20' :
                      p.status === 'Out of Stock' ? 'bg-danger-soft text-danger border-danger/20' :
                      p.status === 'Inactive' || p.status === 'Discontinued' ? 'bg-emphasis text-subtle border-line' :
                      'bg-emphasis/10 text-ink border-line'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1 opacity-100 transition-opacity">
                      <button onClick={() => openEditProduct(p)} title="Edit" className="p-2 text-subtle hover:text-ink hover:bg-emphasis rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p.uuid)} title="Delete" className="p-2 text-danger hover:text-danger hover:bg-danger-soft rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="p-12 text-center text-subtle">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{searchTerm ? 'No products match your search.' : 'No products yet. Click "Add Product" to get started.'}</p>
            </div>
          )}
        </div>
      </div>

      {isProductModalOpen && (
        <Dialog onClose={() => setIsProductModalOpen(false)} label="Product details" className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={() => setIsProductModalOpen(false)} />
          <div className="modal-panel relative w-full max-w-lg bg-surface border border-line rounded-2xl shadow-dialog z-10 mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-line bg-muted/50 rounded-t-2xl">
              <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Tag className="w-5 h-5" />
                {productModalMode === 'add' ? 'Add New Product' : 'Edit Product'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-subtle hover:text-ink transition-colors p-1" aria-label="Close dialog">×</button>
            </div>
            <form onSubmit={handleProductSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-subtle mb-1.5">SKU <span className="text-danger">*</span></label>
                  <input aria-label="SKU" required type="text" value={pSku} onChange={(e) => setPSku(e.target.value)} className={inputClass} placeholder="e.g. BRK-001" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-subtle mb-1.5">Category <span className="text-danger">*</span></label>
                  <input aria-label="Category"
                    required type="text"
                    value={pCat}
                    onChange={(e) => setPCat(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Braking"
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
                <label className="block text-sm font-semibold text-subtle mb-1.5">Product Name <span className="text-danger">*</span></label>
                <input aria-label="Product Name" required type="text" value={pName} onChange={(e) => setPName(e.target.value)} className={inputClass} placeholder="e.g. Brake pad assembly" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-subtle mb-1.5">Product Status</label>
                <select aria-label="Product Status"
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
                  <label className="block text-sm font-semibold text-subtle mb-1.5">Buy Price (PKR) <span className="text-danger">*</span></label>
                  <input aria-label="Buy Price (PKR)" required type="number" step="0.01" min="0" value={pBuy} onChange={(e) => setPBuy(sanitizeNum(e.target.value))} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-subtle mb-1.5">Sale Price (PKR) <span className="text-danger">*</span></label>
                  <input aria-label="Sale Price (PKR)" required type="number" step="0.01" min="0" value={pSale} onChange={(e) => setPSale(sanitizeNum(e.target.value))} className={inputClass} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-subtle mb-1.5">Min Stock Alert</label>
                  <input aria-label="Min Stock Alert" required type="number" min="0" value={pMin} onChange={(e) => setPMin(sanitizeNum(e.target.value))} className={inputClass} placeholder="10" />
                </div>
                <div className="flex flex-col justify-end pb-1">
                  <div className="bg-emphasis/5 border border-line rounded-lg px-4 py-2 flex items-center justify-between">
                    <span className="text-xs text-subtle font-semibold uppercase tracking-wider">Potential Production</span>
                    <span className={`text-lg font-semibold ${potentialProduction === 0 ? 'text-danger' : 'text-ink'}`}>
                      {potentialProduction}
                    </span>
                  </div>
                </div>
              </div>

              {/* Raw Materials Section */}
              <div className="space-y-4 pt-2 border-t border-line">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-ink">Raw Materials Composition</label>
                  <button
                    type="button"
                    onClick={() => setPRawMaterials([...pRawMaterials, { name: '', quantity: 0, requiredPerProduct: '' }])}
                    className="text-xs bg-emphasis hover:bg-emphasis text-body px-2.5 py-1.5 rounded-lg border border-line flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Select Material
                  </button>
                </div>

                {pRawMaterials.length > 0 ? (
                  <div className="space-y-3">
                    {pRawMaterials.map((rm, idx) => (
                      <div key={idx} className="bg-muted/50 border border-line p-3 rounded-xl space-y-3 relative group/rm">
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-12 sm:col-span-6">
                            <label className="text-[11px] uppercase tracking-wider font-semibold text-subtle mb-1 block">Material Name</label>
                            <select aria-label="Material Name"
                              required
                              value={rm.uuid || ''}
                              onChange={(e) => {
                                const selected = globalRawMaterials.find(g => g.uuid === e.target.value);
                                const newRM = [...pRawMaterials];
                                newRM[idx].uuid = selected?.uuid;
                                newRM[idx].name = selected?.name || '';
                                newRM[idx].quantity = selected?.stock || 0;
                                setPRawMaterials(newRM);
                              }}
                              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-line transition-colors"
                            >
                              <option value="">Select Material...</option>
                              {globalRawMaterials.map(g => (
                                <option key={g.uuid} value={g.uuid} disabled={pRawMaterials.some((other, otherIndex) => otherIndex !== idx && other.uuid === g.uuid)}>{g.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-9 sm:col-span-4">
                            <label className="text-[11px] uppercase tracking-wider font-semibold text-subtle mb-1 block">Current Stock</label>
                            <div className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink min-h-[38px] flex items-center">
                              {rm.uuid ? (globalRawMaterials.find(g => g.uuid === rm.uuid)?.stock || 0) : rm.quantity}
                            </div>
                          </div>
                          <div className="col-span-3 sm:col-span-2 text-right flex items-center justify-end">
                             <button
                              type="button"
                              onClick={() => setPRawMaterials(pRawMaterials.filter((_, i) => i !== idx))}
                              className="text-subtle hover:text-danger transition-colors mt-4 sm:mt-6"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label htmlFor={`required-per-product-${idx}`} className="text-[11px] uppercase tracking-wider font-semibold text-subtle mb-1 block">Required per Product</label>
                            <input
                              id={`required-per-product-${idx}`}
                              required
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={rm.requiredPerProduct}
                              onChange={(e) => {
                                const value = sanitizeNum(e.target.value);
                                setPRawMaterials(current => current.map((material, index) => index === idx ? { ...material, requiredPerProduct: value } : material));
                              }}
                              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-line transition-colors"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 border-2 border-dashed border-line rounded-xl">
                    <p className="text-xs text-subtle">No raw materials added yet.</p>
                  </div>
                )}
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 bg-muted hover:bg-emphasis text-ink py-2.5 rounded-lg font-semibold transition-colors border border-line">
                  Cancel
                </button>
                <button type="submit" disabled={pLoading} className="flex-1 bg-brand hover:bg-brand-hover disabled:opacity-60 text-on-brand py-2.5 rounded-lg font-semibold transition-colors shadow-sm flex items-center justify-center gap-2">
                  {pLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Product'}
                </button>
              </div>
            </form>
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
