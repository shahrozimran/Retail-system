'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { Search, Plus, Hammer, Inbox, Loader2, CheckCircle, XCircle, Edit, Trash2, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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

export default function RawMaterials() {
  const { data: response, isLoading, error: fetchError, mutate } = useSWR(
    API_URL ? `${API_URL}?action=raw_materials` : null,
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
    setUuid(''); setName(''); setStock('0');
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
    try {
      const json = await postToAPI(payload);
      if (json.success) {
        showToast(`Material ${modalMode === 'add' ? 'added' : 'updated'} successfully!`, 'success');
        setIsModalOpen(false);
        mutate();
      } else {
        showToast(json.message || 'Action failed.', 'error');
      }
    } catch (err) {
      showToast('Connection failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (uuid: string) => {
    if (!confirm('Delete this material?')) return;
    try {
      const json = await postToAPI({ action: 'delete_raw_material', uuid });
      if (json.success) {
        showToast('Material deleted!', 'success');
        mutate();
      } else {
        showToast(json.message || 'Delete failed.', 'error');
      }
    } catch (err) {
      showToast('Connection failed.', 'error');
    }
  };

  const filteredMaterials = rawMaterials.filter((rm) => {
    if (!searchTerm) return true;
    return rm.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-neutral-500" />
        <p className="text-neutral-500 font-medium">Syncing raw materials...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-base-950 border border-base-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-base-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Hammer className="w-5 h-5 text-neutral-400" />
            Raw Materials
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search materials..."
                className="pl-9 pr-4 py-2 bg-base-900 border border-base-800 rounded-lg text-sm text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white w-full sm:w-64"
              />
            </div>
            <button onClick={openAdd} className="flex items-center gap-2 bg-white hover:bg-neutral-200 text-black px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg whitespace-nowrap">
              <Plus className="w-4 h-4" /> Add Material
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="bg-base-900 text-neutral-400 text-xs uppercase tracking-wider border-b border-base-800">
                <th className="px-6 py-4 font-bold">Material Name</th>
                <th className="px-6 py-4 font-bold text-center">Current Stock</th>
                <th className="px-6 py-4 font-bold text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-800 text-sm">
              {filteredMaterials.map((rm) => (
                <tr key={rm.uuid} className="hover:bg-base-900/50 transition-colors group">
                  <td className="px-6 py-4">
                    <p className="font-bold text-white">{rm.name}</p>
                    <p className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">{rm.uuid.split('-')[0]}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-sm font-bold ${rm.stock <= 0 ? 'text-red-400' : 'text-white'}`}>
                      {rm.stock}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(rm)} title="Edit" className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(rm.uuid)} title="Delete" className="p-2 text-red-500 hover:text-red-300 hover:bg-red-950/30 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredMaterials.length === 0 && (
            <div className="p-12 text-center text-neutral-500">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{searchTerm ? 'No materials match your search.' : 'No materials yet. Click "Add Material" to get started.'}</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-base-950 border border-base-800 rounded-2xl shadow-2xl z-10 mx-4 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-base-800 bg-base-900/50 rounded-t-2xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Hammer className="w-5 h-5" />
                {modalMode === 'add' ? 'Add Raw Material' : 'Edit Material'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white transition-colors p-1">x</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-1.5">Material Name <span className="text-red-400">*</span></label>
                <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Screw, Fabric, etc." />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-1.5">Initial Stock <span className="text-red-400">*</span></label>
                <input required type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className={inputClass} placeholder="0" />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-base-900 hover:bg-base-800 text-white py-2.5 rounded-lg font-bold transition-colors border border-base-800">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-white hover:bg-neutral-200 disabled:opacity-60 text-black py-2.5 rounded-lg font-bold transition-colors shadow-lg flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Material'}
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
