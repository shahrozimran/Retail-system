'use client';

import React, { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { 
  Users, UserPlus, Search, Loader2, ArrowLeftRight, 
  TrendingUp, TrendingDown, Clock, Plus, X, 
  Phone, Mail, Trash2, History, CreditCard, ChevronRight
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Customer = {
  uuid: string;
  name: string;
  phone: string;
  email: string;
  balance: number; // Positive = owes me, Negative = I owe them
  status: string;
};

type LedgerEntry = {
  id: string;
  date: string;
  type: 'Receivable' | 'Payable';
  amount: number;
  description: string;
  balanceSnapshot: number;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP error: ' + res.status);
  return res.json();
};

const postToAPI = async (payload: any) => {
  const res = await fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(payload),
  });
  return res.json();
};

export default function CustomersPage() {
  const { data: custResponse, isLoading: custLoading } = useSWR(
    API_URL ? `${API_URL}?action=customers` : null,
    fetcher
  );

  const customers: Customer[] = Array.isArray(custResponse?.data) ? custResponse.data : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Form states
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment states
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState<'Receivable' | 'Payable'>('Receivable');
  const [payDesc, setPayDesc] = useState('');

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(val);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    setIsSubmitting(true);
    try {
      const res = await postToAPI({ action: 'add_customer', name: newName, phone: newPhone });
      if (res.success) {
        mutate(`${API_URL}?action=customers`);
        setIsAddModalOpen(false);
        setNewName('');
        setNewPhone('');
      } else {
        alert("Error: " + res.message);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to API.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !payAmount) return;
    setIsSubmitting(true);
    try {
      const res = await postToAPI({ 
        action: 'record_customer_payment', 
        customerUuid: selectedCustomer.uuid,
        amount: Number(payAmount),
        type: payType,
        description: payDesc
      });
      if (res.success) {
        mutate(`${API_URL}?action=customers`);
        mutate(`${API_URL}?action=customer_ledger&customerUuid=${selectedCustomer.uuid}`);
        setIsPaymentModalOpen(false);
        setPayAmount('');
        setPayDesc('');
      } else {
        alert("Error: " + res.message);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to API.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (uuid: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    try {
      await postToAPI({ action: 'delete_customer', customerUuid: uuid });
      mutate(`${API_URL}?action=customers`);
    } catch (err) {
      console.error(err);
    }
  };

  const totalReceivable = customers.filter(c => c.balance > 0).reduce((s, c) => s + c.balance, 0);
  const totalPayable = customers.filter(c => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);

  if (!mounted) return null;

  return (
    <div className="space-y-6 fade-in pb-12">
      {/* Summary Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-6 rounded-2xl bg-base-950 border border-base-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-950/20 text-green-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider">Customer Receivables</p>
            <p className="text-2xl font-black text-white tabular-nums">{formatCurrency(totalReceivable)}</p>
            <p className="text-[10px] text-neutral-600 mt-1">Amount customers owe you</p>
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-base-950 border border-base-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-950/20 text-red-400">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider">Your Payables</p>
            <p className="text-2xl font-black text-white tabular-nums">{formatCurrency(totalPayable)}</p>
            <p className="text-[10px] text-neutral-600 mt-1">Amount you owe to customers</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-base-950 border border-base-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-base-800 bg-base-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
              <Users className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Customer Accounts</h2>
              <p className="text-xs text-neutral-500">{customers.length} registered customers</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input 
                type="text" 
                placeholder="Search name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-base-900 border border-base-800 rounded-xl text-sm text-white focus:outline-none focus:border-white/20 transition-all"
              />
            </div>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-neutral-200 transition-all shadow-lg active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              Add Customer
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {custLoading ? (
            <div className="p-20 flex justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-neutral-500" />
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-base-900 text-neutral-500 text-[10px] uppercase tracking-widest font-bold border-b border-base-800">
                  <th className="px-6 py-4">Customer Name</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4 text-right">Net Balance</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800">
                {filteredCustomers.map((c) => (
                  <tr key={c.uuid} className="group hover:bg-base-900/50 transition-colors cursor-pointer" onClick={() => { setSelectedCustomer(c); setIsLedgerOpen(true); }}>
                    <td className="px-6 py-5">
                      <p className="font-bold text-white">{c.name}</p>
                      <p className="text-[10px] text-neutral-500 uppercase tracking-tighter font-mono">UID: {c.uuid.split('-')[0]}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs text-neutral-400">
                          <Phone className="w-3 h-3" /> {c.phone || 'No phone'}
                        </div>
                        {c.email && (
                          <div className="flex items-center gap-2 text-xs text-neutral-400">
                            <Mail className="w-3 h-3" /> {c.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <p className={`text-sm font-black tabular-nums ${c.balance > 0 ? 'text-green-400' : c.balance < 0 ? 'text-red-400' : 'text-neutral-500'}`}>
                        {c.balance > 0 ? '+' : ''}{formatCurrency(c.balance)}
                      </p>
                      <p className="text-[10px] text-neutral-600 uppercase font-bold tracking-tight">
                        {c.balance > 0 ? 'Customer Owes You' : c.balance < 0 ? 'You Owe Customer' : 'Settled'}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="px-2 py-1 rounded bg-base-900 text-neutral-400 text-[10px] font-bold uppercase border border-base-800">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 hover:bg-base-800 rounded-lg text-white transition-colors border border-base-800">
                          <History className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(c.uuid); }}
                          className="p-2 hover:bg-red-950/30 rounded-lg text-red-500 transition-colors border border-red-900/30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center text-neutral-600">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-10" />
                      <p className="text-sm">No customers found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)} />
          <form onSubmit={handleAddCustomer} className="relative w-full max-w-md bg-base-950 border border-base-800 rounded-3xl shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-base-800 flex items-center justify-between">
              <h3 className="text-lg font-black text-white">New Customer Profile</h3>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1 uppercase tracking-widest">Customer Name</label>
                <input 
                  autoFocus
                  required
                  type="text" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-3 bg-base-900 border border-base-800 rounded-xl text-white focus:outline-none focus:border-white/20 transition-all"
                  placeholder="e.g. Usman Khan"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 mb-1 uppercase tracking-widest">Phone Number (Optional)</label>
                <input 
                  type="text" 
                  value={newPhone} 
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-base-900 border border-base-800 rounded-xl text-white focus:outline-none focus:border-white/20 transition-all"
                  placeholder="e.g. +92 300 1234567"
                />
              </div>
            </div>
            <div className="p-6 bg-base-900/50 flex gap-3">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 px-4 py-3 border border-base-800 rounded-xl font-bold text-sm text-neutral-400 hover:bg-base-800 transition-all">Cancel</button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="flex-1 px-4 py-3 bg-white text-black rounded-xl font-bold text-sm hover:bg-neutral-200 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Customer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Ledger Modal */}
      {isLedgerOpen && selectedCustomer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsLedgerOpen(false)} />
          <div className="relative w-full max-w-3xl bg-base-950 border border-base-800 rounded-3xl shadow-2xl z-10 flex flex-col h-[85vh] animate-in slide-in-from-bottom-8 duration-300">
            {/* Header */}
            <div className="p-6 border-b border-base-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white text-black flex items-center justify-center text-xl font-black">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">{selectedCustomer.name}</h3>
                  <p className="text-xs text-neutral-500 font-mono tracking-tighter">{selectedCustomer.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right mr-4">
                  <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Current Balance</p>
                  <p className={`text-xl font-black tabular-nums ${selectedCustomer.balance > 0 ? 'text-green-400' : selectedCustomer.balance < 0 ? 'text-red-400' : 'text-neutral-500'}`}>
                    {formatCurrency(selectedCustomer.balance)}
                  </p>
                </div>
                <button onClick={() => setIsLedgerOpen(false)} className="p-2 hover:bg-base-900 rounded-full transition-colors text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="p-4 bg-base-900/30 border-b border-base-800 flex items-center justify-between px-6">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-neutral-500" />
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Transaction History</span>
              </div>
              <button 
                onClick={() => setIsPaymentModalOpen(true)}
                className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-neutral-200 transition-all shadow-lg"
              >
                <Plus className="w-4 h-4" />
                New Entry
              </button>
            </div>

            {/* Ledger List */}
            <div className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-base-800">
              <LedgerList customerUuid={selectedCustomer.uuid} formatCurrency={formatCurrency} />
            </div>
          </div>
        </div>
      )}

      {/* Record Entry Modal */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsPaymentModalOpen(false)} />
          <form onSubmit={handleRecordPayment} className="relative w-full max-w-md bg-base-950 border border-base-800 rounded-3xl shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-base-800 flex items-center justify-between">
              <h3 className="text-lg font-black text-white">Record Entry</h3>
              <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex gap-2 p-1 bg-base-900 rounded-2xl border border-base-800">
                {(['Receivable', 'Payable'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPayType(type)}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                      payType === type ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-neutral-400'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 mb-1 uppercase tracking-widest">Amount (PKR)</label>
                  <input 
                    required
                    autoFocus
                    type="number" 
                    value={payAmount} 
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full px-4 py-4 bg-base-900 border border-base-800 rounded-2xl text-2xl font-black text-white focus:outline-none focus:border-white/20 transition-all"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 mb-1 uppercase tracking-widest">Description / Reference</label>
                  <textarea 
                    value={payDesc} 
                    onChange={(e) => setPayDesc(e.target.value)}
                    className="w-full px-4 py-3 bg-base-900 border border-base-800 rounded-xl text-sm text-white focus:outline-none focus:border-white/20 transition-all h-24 resize-none"
                    placeholder="e.g. Partial payment for order #123"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-base-800 text-white space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                  <span>Current Balance</span>
                  <span>Impact</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold">{formatCurrency(selectedCustomer.balance)}</span>
                  <span className={`font-black ${
                    payType === 'Receivable' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {payType === 'Receivable' ? '+' : '-'}{formatCurrency(Number(payAmount) || 0)}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-6 bg-base-900/50 flex gap-3">
              <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="flex-1 px-4 py-3 border border-base-800 rounded-xl font-bold text-sm text-neutral-400 hover:bg-base-800 transition-all">Cancel</button>
              <button 
                type="submit" 
                disabled={isSubmitting || !payAmount}
                className="flex-1 px-4 py-3 bg-white text-black rounded-xl font-bold text-sm hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Entry'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function LedgerList({ customerUuid, formatCurrency }: { customerUuid: string, formatCurrency: (v: number) => string }) {
  const { data: ledgerResponse, isLoading } = useSWR(
    API_URL ? `${API_URL}?action=customer_ledger&customerUuid=${customerUuid}` : null,
    fetcher
  );

  const ledger: LedgerEntry[] = Array.isArray(ledgerResponse?.data) ? ledgerResponse.data : [];

  if (isLoading) return (
    <div className="p-20 flex justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-black opacity-20" />
    </div>
  );

  if (ledger.length === 0) return (
    <div className="p-20 text-center text-neutral-400">
      <Clock className="w-12 h-12 mx-auto mb-4 opacity-10" />
      <p className="text-sm">No ledger entries yet.</p>
    </div>
  );

  return (
    <div className="divide-y divide-base-800">
      {ledger.map((entry) => (
        <div key={entry.id} className="p-6 hover:bg-base-900/50 transition-colors flex items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`mt-1 p-2 rounded-lg ${
              entry.type === 'Receivable' ? 'bg-blue-950/30 text-blue-400' :
              'bg-red-950/30 text-red-400'
            }`}>
              {entry.type === 'Receivable' ? <TrendingUp className="w-4 h-4" /> :
               <TrendingDown className="w-4 h-4" />}
            </div>
            <div>
              <p className="font-bold text-white">{entry.description || entry.type}</p>
              <p className="text-[10px] text-neutral-500 font-mono mt-0.5 tracking-tighter">{new Date(entry.date).toLocaleString()}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-black tabular-nums ${
              entry.type === 'Receivable' ? 'text-green-400' : 'text-red-400'
            }`}>
              {entry.type === 'Receivable' ? '+' : '-'}{formatCurrency(entry.amount)}
            </p>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mt-0.5">
              Bal: {formatCurrency(entry.balanceSnapshot)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
