'use client';
import Dialog from '@/components/Dialog';
import PageHeading from '@/components/PageHeading';
import SummaryStrip from '@/components/SummaryStrip';
import DataNotice from '@/components/DataNotice';
import { errorMessage } from '@/lib/errors';
import { API_URL, PROXY, apiFetch as fetch } from '@/lib/api';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Search, Plus, Hammer, Inbox, Loader2, CheckCircle, XCircle, Edit, Trash2 } from 'lucide-react';


type RawMaterial = {
  uuid: string;
  name: string;
  stock: number;
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

export default function RawMaterials() {
  const { data: response, isLoading, error, mutate } = useSWR(
    API_URL ? `${PROXY}?action=raw_materials` : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  const rawMaterials: RawMaterial[] = Array.isArray(response?.data) ? response.data : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [uuid, setUuid] = useState('');
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [loading, setLoading] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openAdd = () => {
    setModalMode('add');
    setUuid(''); setName(''); setStock('');
    setIsModalOpen(true);
  };

  const openEdit = (rm: RawMaterial) => {
    setModalMode('edit');
    setUuid(rm.uuid); setName(rm.name); setStock(String(rm.stock));
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!API_URL) { showToast('API URL not configured', 'error'); return; }
    setLoading(true);
    const payload = {
      action: modalMode === 'add' ? 'add_raw_material' : 'update_raw_material',
      uuid, name, stock: Number(stock)
    };

    const tempUuid = uuid || 'temp-' + crypto.randomUUID();
    const newMaterial: RawMaterial = {
      uuid: tempUuid,
      name,
      stock: Number(stock)
    };

    const updatePromise = postToAPI(payload).then(res => {
      if (!res.success) throw new Error(res.message || 'Action failed');
      return res;
    });

    setIsModalOpen(false);

    try {
      if (modalMode === 'add') {
        await mutate(
          updatePromise.then(() => {
            return {
              ...response,
              data: [...rawMaterials, { ...newMaterial, uuid: 'loading...' }]
            };
          }),
          {
            optimisticData: {
              ...response,
              data: [...rawMaterials, newMaterial]
            },
            rollbackOnError: true,
            revalidate: true
          }
        );
        showToast('Material added successfully!', 'success');
      } else {
        const updatedList = rawMaterials.map(rm => rm.uuid === uuid ? newMaterial : rm);
        await mutate(
          updatePromise.then(() => {
            return {
              ...response,
              data: updatedList
            };
          }),
          {
            optimisticData: {
              ...response,
              data: updatedList
            },
            rollbackOnError: true,
            revalidate: true
          }
        );
        showToast('Material updated successfully!', 'success');
      }
    } catch (err: unknown) {
      showToast(errorMessage(err) || 'Connection failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (uuid: string) => {
    if (!confirm('Delete this material?')) return;

    const updatePromise = postToAPI({ action: 'delete_raw_material', uuid }).then(res => {
      if (!res.success) throw new Error(res.message || 'Delete failed');
      return res;
    });

    try {
      const updatedList = rawMaterials.filter(rm => rm.uuid !== uuid);
      await mutate(
        updatePromise.then(() => {
          return {
            ...response,
            data: updatedList
          };
        }),
        {
          optimisticData: {
            ...response,
            data: updatedList
          },
          rollbackOnError: true,
          revalidate: true
        }
      );
      showToast('Material deleted!', 'success');
    } catch (err: unknown) {
      showToast(errorMessage(err) || 'Connection failed.', 'error');
    }
  };

  const filteredMaterials = rawMaterials.filter((rm) => {
    if (!searchTerm) return true;
    return rm.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-subtle" />
        <p className="text-subtle font-medium">Syncing raw materials...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <PageHeading title="Raw materials" description="Track the materials that keep your production moving." />
      {error && <DataNotice onRetry={() => mutate()} />}
      <SummaryStrip items={[{ label: 'Material types', value: rawMaterials.length }, { label: 'Materials in stock', value: rawMaterials.filter(m => m.stock > 0).length }, { label: 'Materials to replenish', value: rawMaterials.filter(m => m.stock <= 0).length }]} />
      <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
            <Hammer className="w-5 h-5 text-subtle" />
            Material catalog
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search materials..."
                className="pl-9 pr-4 py-2 bg-muted border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-line focus:ring-1 focus:ring-brand w-full sm:w-64"
              />
            </div>
            <button onClick={openAdd} className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-on-brand px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add Material
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="bg-muted text-subtle text-xs uppercase tracking-wider border-b border-line">
                <th className="px-6 py-4 font-semibold">Material Name</th>
                <th className="px-6 py-4 font-semibold text-center">Current Stock</th>
                <th className="px-6 py-4 font-semibold text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-sm">
              {filteredMaterials.map((rm) => (
                <tr key={rm.uuid} className="hover:bg-muted/50 transition-colors group">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-ink">{rm.name}</p>
                    <p className="text-[11px] text-subtle font-mono uppercase tracking-wide">{rm.uuid.split('-')[0]}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-sm font-semibold ${rm.stock <= 0 ? 'text-danger' : 'text-ink'}`}>
                      {rm.stock}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1 opacity-100 transition-opacity">
                      <button onClick={() => openEdit(rm)} title="Edit" className="p-2 text-subtle hover:text-ink hover:bg-emphasis rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(rm.uuid)} title="Delete" className="p-2 text-danger hover:text-danger hover:bg-danger-soft rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredMaterials.length === 0 && (
            <div className="p-12 text-center text-subtle">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{searchTerm ? 'No materials match your search.' : 'No materials yet. Click "Add Material" to get started.'}</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <Dialog onClose={() => setIsModalOpen(false)} label="Raw material details" className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={() => setIsModalOpen(false)} />
          <div className="modal-panel relative w-full max-w-md bg-surface border border-line rounded-2xl shadow-dialog z-10 mx-4 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-line bg-muted/50 rounded-t-2xl">
              <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Hammer className="w-5 h-5" />
                {modalMode === 'add' ? 'Add Raw Material' : 'Edit Material'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-subtle hover:text-ink transition-colors p-1" aria-label="Close dialog">×</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-subtle mb-1.5">Material Name <span className="text-danger">*</span></label>
                <input aria-label="Material Name" required type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Steel sheet" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-subtle mb-1.5">Initial Stock <span className="text-danger">*</span></label>
                <input aria-label="Initial Stock" required type="number" min="0" value={stock} onChange={(e) => setStock(sanitizeNum(e.target.value))} className={inputClass} placeholder="0" />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-muted hover:bg-emphasis text-ink py-2.5 rounded-lg font-semibold transition-colors border border-line">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-brand hover:bg-brand-hover disabled:opacity-60 text-on-brand py-2.5 rounded-lg font-semibold transition-colors shadow-sm flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Material'}
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
