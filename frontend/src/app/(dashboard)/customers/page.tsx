'use client';
import Dialog from '@/components/Dialog';
import PageHeading from '@/components/PageHeading';
import DataNotice from '@/components/DataNotice';
import { useMounted } from '@/hooks/useMounted';
import { errorMessage } from '@/lib/errors';
import { API_URL, PROXY, apiFetch as fetch } from '@/lib/api';
import { formatMoney } from '@/lib/money';

import React, { useRef, useState } from 'react';
import { clearPendingCustomerEntry, customerEntryError, prepareCustomerEntry, readPendingCustomerEntry } from '@/lib/customer-entry';
import useSWR, { mutate } from 'swr';
import {
  Users, UserPlus, Search, Loader2,
  TrendingUp, TrendingDown, Clock, Plus, X,
  Phone, Mail, Trash2, History
} from 'lucide-react';


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

const postToAPI = async (payload: Record<string, unknown>) => {
  const res = await fetch(PROXY, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(payload),
  });
  return res.json();
};

export default function CustomersPage() {
  const { data: custResponse, error: customersError, isLoading: custLoading, mutate: mutateCustomers } = useSWR(
    API_URL ? `${PROXY}?action=customers` : null,
    fetcher
  );

  const customers: Customer[] = Array.isArray(custResponse?.data) ? custResponse.data : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pendingEntry, setPendingEntry] = useState(readPendingCustomerEntry);
  const [isLedgerOpen, setIsLedgerOpen] = useState(() => Boolean(pendingEntry));
  const [customerSnapshot, setSelectedCustomer] = useState<Customer | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(() => Boolean(pendingEntry));
  const selectedCustomer = customers.find(c => c.uuid === customerSnapshot?.uuid) ?? customerSnapshot ?? (isPaymentModalOpen && pendingEntry ? customers.find(c => c.uuid === pendingEntry.customerUuid) ?? null : null);
  const [paymentError, setPaymentError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const paymentInFlight = useRef(false);

  // Form states
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment states
  const [payAmount, setPayAmount] = useState(() => pendingEntry ? String(pendingEntry.amount) : '');
  const [payType, setPayType] = useState<'Receivable' | 'Payable'>(() => pendingEntry?.type ?? 'Receivable');
  const [payDesc, setPayDesc] = useState(() => pendingEntry?.description ?? '');

  const mounted = useMounted();

  const formatCurrency = formatMoney;

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    setIsSubmitting(true);

    const newCustomerOptimistic: Customer = {
      uuid: 'temp-' + crypto.randomUUID(),
      name: newName,
      phone: newPhone,
      email: '',
      balance: 0,
      status: 'Active'
    };

    const updatePromise = postToAPI({ action: 'add_customer', name: newName, phone: newPhone })
      .then(res => {
        if (!res.success) throw new Error(res.message || 'Failed to add customer');
        return res;
      });

    try {
      setIsAddModalOpen(false);
      setNewName('');
      setNewPhone('');

      await mutateCustomers(
        updatePromise.then(() => {
          return {
            ...custResponse,
            data: [...customers, { ...newCustomerOptimistic, uuid: 'loading...' }]
          };
        }),
        {
          optimisticData: {
            ...custResponse,
            data: [...customers, newCustomerOptimistic]
          },
          rollbackOnError: true,
          revalidate: true
        }
      );
    } catch (err: unknown) {
      console.error(err);
      alert(errorMessage(err) || "Failed to add customer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer || paymentInFlight.current) return;
    const validation = customerEntryError(Number(payAmount), payDesc);
    if (!pendingEntry && validation) { setPaymentError(validation); return; }
    paymentInFlight.current = true;
    setIsSubmitting(true); setPaymentError(''); setSaveNotice('');
    let committed = false;
    try {
      const payload = pendingEntry ?? await prepareCustomerEntry(selectedCustomer.uuid, Number(payAmount), payType, payDesc);
      setPendingEntry(payload);
      const response = await fetch(PROXY, { method: 'POST', body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.commitConfirmed || !result.customer || !Array.isArray(result.customers) || !Array.isArray(result.ledger)) {
        if (result.operationState === 'rolled_back') { clearPendingCustomerEntry(payload.requestId); setPendingEntry(null); }
        throw new Error(result.message || 'Save is not confirmed yet. Retry this same entry to check it safely.');
      }
      committed = true;
      clearPendingCustomerEntry(payload.requestId); setPendingEntry(null);
      // Display values read back from Supabase. Do not replace a confirmed
      // ledger with undefined or calculate its balance from an old UI snapshot.
      setSelectedCustomer(result.customer);
      await Promise.all([
        mutateCustomers({ success: true, data: result.customers }, { revalidate: false }),
        mutate(PROXY + '?action=customer_ledger&customerUuid=' + result.customer.uuid, { success: true, data: result.ledger }, { revalidate: false }),
      ]);
      setPayAmount(''); setPayDesc(''); setIsPaymentModalOpen(false);
      setSaveNotice('Entry saved to Supabase and verified. The balance and ledger are up to date.');
    } catch (error) {
      if (committed) {
        setIsPaymentModalOpen(false);
        setSaveNotice('The entry is saved to Supabase. Refresh the account to reload its latest display.');
      } else {
        const recovered = readPendingCustomerEntry();
        if (recovered) {
          setPendingEntry(recovered);
          setPayAmount(String(recovered.amount)); setPayType(recovered.type); setPayDesc(recovered.description);
          const customer = customers.find(c => c.uuid === recovered.customerUuid);
          if (customer) setSelectedCustomer(customer);
        }
        setPaymentError(errorMessage(error) + ' Your entry details are kept here until confirmation.');
      }
    } finally { paymentInFlight.current = false; setIsSubmitting(false); }
  };

  const openPayment = () => {
    setPaymentError('');
    if (pendingEntry) {
      const customer = customers.find(c => c.uuid === pendingEntry.customerUuid);
      if (customer) setSelectedCustomer(customer);
      setPayAmount(String(pendingEntry.amount)); setPayType(pendingEntry.type); setPayDesc(pendingEntry.description);
    }
    setIsPaymentModalOpen(true);
  };

  const handleDeleteCustomer = async (uuid: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;

    const updatePromise = postToAPI({ action: 'delete_customer', customerUuid: uuid })
      .then(res => {
        if (!res.success) throw new Error(res.message || 'Failed to delete customer');
        return res;
      });

    try {
      await mutateCustomers(
        updatePromise.then(() => {
          return {
            ...custResponse,
            data: customers.filter(c => c.uuid !== uuid)
          };
        }),
        {
          optimisticData: {
            ...custResponse,
            data: customers.filter(c => c.uuid !== uuid)
          },
          rollbackOnError: true,
          revalidate: true
        }
      );
    } catch (err: unknown) {
      console.error(err);
      alert(errorMessage(err) || "Failed to delete customer.");
    }
  };

  const totalReceivable = customers.filter(c => c.balance > 0).reduce((s, c) => s + c.balance, 0);
  const totalPayable = customers.filter(c => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);

  if (!mounted) return null;

  return (
    <div className="space-y-6 fade-in pb-12">
      <PageHeading title="Customers" description="Manage relationships, account balances and payment history." />
      {saveNotice && !isLedgerOpen && <div role="status" className="p-4 bg-success-soft text-success border border-success/20 rounded-xl flex gap-3 items-center text-sm"><span>{saveNotice}</span><button onClick={() => setSaveNotice('')} className="ml-auto underline text-xs">Dismiss</button></div>}
      {pendingEntry && (!isPaymentModalOpen || !selectedCustomer) && <div role="status" className="p-4 bg-warning-soft text-warning border border-warning/20 rounded-xl flex flex-wrap gap-3 items-center text-sm"><span>A customer entry still needs confirmation. Its recovery draft is kept on this device until confirmation.</span><button onClick={openPayment} className="ml-auto underline text-xs font-semibold">Verify saved entry</button></div>}
      {customersError && <DataNotice onRetry={() => mutateCustomers()} />}
      {/* Summary Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger">
        <div className="p-6 rounded-2xl bg-surface border border-line shadow-sm flex items-center gap-4"><div className="p-3 rounded-xl bg-brand-soft text-brand-ink"><Users className="w-6 h-6" /></div><div><p className="text-xs text-subtle font-medium">Customer accounts</p><p className="text-2xl font-semibold tabular-nums mt-1">{customers.length}</p><p className="text-[11px] text-subtle mt-1">Registered in your workspace</p></div></div>
        <div className="p-6 rounded-2xl bg-surface border border-line shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-success-soft text-success">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-subtle font-semibold uppercase tracking-wider">Customer Receivables</p>
            <p className="text-2xl font-semibold text-ink tabular-nums">{formatCurrency(totalReceivable)}</p>
            <p className="text-[11px] text-subtle mt-1">Amount customers owe you</p>
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-surface border border-line shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-danger-soft text-danger">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-subtle font-semibold uppercase tracking-wider">Your Payables</p>
            <p className="text-2xl font-semibold text-ink tabular-nums">{formatCurrency(totalPayable)}</p>
            <p className="text-[11px] text-subtle mt-1">Amount you owe to customers</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-panel">
        <div className="p-5 border-b border-line bg-muted/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
              <Users className="w-5 h-5 text-on-brand" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-ink">Customer Accounts</h2>
              <p className="text-xs text-subtle">{customers.length} registered customers</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
              <input
                type="text"
                placeholder="Search name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-muted border border-line rounded-xl text-sm text-ink focus:outline-none focus:border-line transition-all"
              />
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 bg-brand text-on-brand px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-hover transition-all shadow-sm active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              Add Customer
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {custLoading ? (
            <div className="p-20 flex justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-subtle" />
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-muted text-subtle text-[11px] uppercase tracking-wide font-semibold border-b border-line">
                  <th className="px-6 py-4">Customer Name</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4 text-right">Net Balance</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredCustomers.map((c) => (
                  <tr key={c.uuid} className="group hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => { setSelectedCustomer(c); setIsLedgerOpen(true); }}>
                    <td className="px-6 py-5">
                      <p className="font-semibold text-ink">{c.name}</p>
                      <p className="text-[11px] text-subtle uppercase tracking-tighter font-mono">UID: {c.uuid.split('-')[0]}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs text-subtle">
                          <Phone className="w-3 h-3" /> {c.phone || 'No phone'}
                        </div>
                        {c.email && (
                          <div className="flex items-center gap-2 text-xs text-subtle">
                            <Mail className="w-3 h-3" /> {c.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <p className={`text-sm font-semibold tabular-nums ${c.balance > 0 ? 'text-success' : c.balance < 0 ? 'text-danger' : 'text-subtle'}`}>
                        {c.balance > 0 ? '+' : ''}{formatCurrency(c.balance)}
                      </p>
                      <p className="text-[11px] text-subtle uppercase font-semibold tracking-tight">
                        {c.balance > 0 ? 'Customer Owes You' : c.balance < 0 ? 'You Owe Customer' : 'Settled'}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="px-2 py-1 rounded bg-muted text-subtle text-[11px] font-semibold uppercase border border-line">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity">
                        <button aria-label={`View ${c.name} account`} className="p-2 hover:bg-emphasis rounded-lg text-ink transition-colors border border-line">
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          aria-label={`Delete ${c.name}`}
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(c.uuid); }}
                          className="p-2 hover:bg-danger-soft rounded-lg text-danger transition-colors border border-danger/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center text-subtle">
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
        <Dialog onClose={() => setIsAddModalOpen(false)} label="Add customer" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={() => setIsAddModalOpen(false)} />
          <form onSubmit={handleAddCustomer} className="modal-panel relative w-full max-w-md bg-surface border border-line rounded-2xl shadow-dialog z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-line flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">New Customer Profile</h3>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-subtle hover:text-ink transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-subtle mb-1 uppercase tracking-wide">Customer Name</label>
                <input aria-label="Customer Name"
                  autoFocus
                  required
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-3 bg-muted border border-line rounded-xl text-ink focus:outline-none focus:border-line transition-all"
                  placeholder="e.g. Usman Khan"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-subtle mb-1 uppercase tracking-wide">Phone Number (Optional)</label>
                <input aria-label="Phone Number (Optional)"
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-muted border border-line rounded-xl text-ink focus:outline-none focus:border-line transition-all"
                  placeholder="e.g. +92 300 1234567"
                />
              </div>
            </div>
            <div className="p-6 bg-muted/50 flex gap-3">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 px-4 py-3 border border-line rounded-xl font-semibold text-sm text-subtle hover:bg-emphasis transition-all">Cancel</button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-3 bg-brand text-on-brand rounded-xl font-semibold text-sm hover:bg-brand-hover transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Customer'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Customer Ledger Modal */}
      {isLedgerOpen && selectedCustomer && (
        <Dialog onClose={() => setIsLedgerOpen(false)} label="Customer account ledger" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={() => setIsLedgerOpen(false)} />
          <div className="modal-panel relative w-full max-w-3xl bg-surface border border-line rounded-2xl shadow-dialog z-10 flex flex-col h-[85vh] animate-in slide-in-from-bottom-8 duration-300">
            {/* Header */}
            <div className="p-6 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-brand text-on-brand flex items-center justify-center text-xl font-semibold">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-ink">{selectedCustomer.name}</h3>
                  <p className="text-xs text-subtle font-mono tracking-tighter">{selectedCustomer.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right mr-4">
                  <p className="text-[11px] text-subtle font-semibold uppercase tracking-wide">Current Balance</p>
                  <p className={`text-xl font-semibold tabular-nums ${selectedCustomer.balance > 0 ? 'text-success' : selectedCustomer.balance < 0 ? 'text-danger' : 'text-subtle'}`}>
                    {formatCurrency(selectedCustomer.balance)}
                  </p>
                </div>
                <button onClick={() => setIsLedgerOpen(false)} className="p-2 hover:bg-muted rounded-full transition-colors text-subtle hover:text-ink"><X className="w-6 h-6" /></button>
              </div>
            </div>

            {saveNotice && <div role="status" className="mx-5 mt-4 p-3 rounded-lg bg-success-soft text-success text-xs border border-success/20 flex gap-3 items-center"><span>{saveNotice}</span><button className="underline ml-auto" onClick={() => setSaveNotice('')}>Dismiss</button></div>}

            {/* Actions Bar */}
            <div className="p-4 bg-muted/30 border-b border-line flex items-center justify-between px-6">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-subtle" />
                <span className="text-xs font-semibold text-subtle uppercase tracking-wide">Transaction History</span>
              </div>
              <button
                onClick={openPayment}
                className="flex items-center gap-2 bg-brand text-on-brand px-4 py-2 rounded-xl text-xs font-semibold hover:bg-brand-hover transition-all shadow-sm"
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
        </Dialog>
      )}

      {/* Record Entry Modal */}
      {isPaymentModalOpen && selectedCustomer && (
        <Dialog busy={isSubmitting} onClose={() => { if (!isSubmitting) setIsPaymentModalOpen(false); }} label="Record account entry" className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={() => { if (!isSubmitting) setIsPaymentModalOpen(false); }} />
          <form onSubmit={handleRecordPayment} className="modal-panel relative w-full max-w-md bg-surface border border-line rounded-2xl shadow-dialog z-10 overflow-hidden max-h-[92dvh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-line flex items-center justify-between shrink-0">
              <div><h3 className="text-lg font-semibold text-ink">Record Entry</h3><p className="text-xs text-subtle mt-1">{selectedCustomer.name}{pendingEntry ? ' · Verify pending entry' : ''}</p></div>
              <button type="button" disabled={isSubmitting} aria-label="Close entry" onClick={() => setIsPaymentModalOpen(false)} className="text-subtle hover:text-ink transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto min-h-0 flex-1">
              {paymentError && <p role="alert" className="text-sm text-warning bg-warning-soft border border-warning/20 rounded-lg p-3">{paymentError}</p>}
              {isSubmitting && <p role="status" className="text-xs text-brand-ink">Saving and verifying with Supabase. Please keep this window open.</p>}
              {pendingEntry && !isSubmitting && <p className="text-xs text-subtle">This entry has a saved recovery reference. Retry confirmation checks the same entry and cannot add it twice.</p>}
              <div className="flex gap-2 p-1 bg-muted rounded-2xl border border-line">
                {(['Receivable', 'Payable'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={isSubmitting || Boolean(pendingEntry)}
                    onClick={() => setPayType(type)}
                    className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide rounded-xl transition-all ${
                      payType === type ? 'bg-brand text-on-brand shadow-sm' : 'text-subtle hover:text-subtle'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-subtle mb-1 uppercase tracking-wide">Amount (PKR)</label>
                  <input aria-label="Amount (PKR)"
                    required
                    autoFocus
                    type="number"
                    min="0.01" max="1000000000" step="0.01"
                    readOnly={isSubmitting || Boolean(pendingEntry)}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value.replace(/^0+(?=\d)/, ''))}
                    className="w-full px-4 py-4 bg-muted border border-line rounded-2xl text-2xl font-semibold text-ink focus:outline-none focus:border-line transition-all"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-subtle mb-1 uppercase tracking-wide">Description / Reference</label>
                  <textarea maxLength={2000} readOnly={isSubmitting || Boolean(pendingEntry)} aria-label="Description / Reference"
                    value={payDesc}
                    onChange={(e) => setPayDesc(e.target.value)}
                    className="w-full px-4 py-3 bg-muted border border-line rounded-xl text-sm text-ink focus:outline-none focus:border-line transition-all h-24 resize-none"
                    placeholder="e.g. Partial payment for order #123"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-line text-ink space-y-2">
                <div className="flex justify-between text-[11px] font-semibold text-subtle uppercase tracking-wide">
                  <span>Current Balance</span>
                  <span>{pendingEntry ? 'Original entry' : 'Impact'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{formatCurrency(selectedCustomer.balance)}</span>
                  <span className={`font-semibold ${
                    payType === 'Receivable' ? 'text-success' : 'text-danger'
                  }`}>
                    {payType === 'Receivable' ? '+' : '-'}{formatCurrency(Number(payAmount) || 0)}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-6 bg-muted/50 flex gap-3 shrink-0">
              <button type="button" disabled={isSubmitting} onClick={() => setIsPaymentModalOpen(false)} className="flex-1 px-4 py-3 border border-line rounded-xl font-semibold text-sm text-subtle hover:bg-emphasis transition-all disabled:opacity-40">{pendingEntry ? 'Close, keep draft' : 'Cancel'}</button>
              <button
                type="submit"
                disabled={isSubmitting || !payAmount}
                className="flex-1 px-4 py-3 bg-brand text-on-brand rounded-xl font-semibold text-sm hover:bg-brand-hover transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : pendingEntry ? 'Retry confirmation' : 'Save Entry'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function LedgerList({ customerUuid, formatCurrency }: { customerUuid: string, formatCurrency: (v: number) => string }) {
  const { data: ledgerResponse, error, isLoading, mutate: refreshLedger } = useSWR(
    API_URL ? `${PROXY}?action=customer_ledger&customerUuid=${customerUuid}` : null,
    fetcher
  );

  const ledger: LedgerEntry[] = Array.isArray(ledgerResponse?.data) ? ledgerResponse.data : [];

  if (isLoading) return (
    <div className="p-20 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-subtle" />
    </div>
  );

  if (error) return <div className="p-5"><DataNotice onRetry={() => refreshLedger()} /></div>;

  if (ledger.length === 0) return (
    <div className="p-20 text-center text-subtle">
      <Clock className="w-12 h-12 mx-auto mb-4 opacity-10" />
      <p className="text-sm">No ledger entries yet.</p>
    </div>
  );

  return (
    <div className="divide-y divide-line">
      {ledger.map((entry) => (
        <div key={entry.id} className="p-6 hover:bg-muted/50 transition-colors flex items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`mt-1 p-2 rounded-lg ${
              entry.type === 'Receivable' ? 'bg-info-soft text-info' :
              'bg-danger-soft text-danger'
            }`}>
              {entry.type === 'Receivable' ? <TrendingUp className="w-4 h-4" /> :
               <TrendingDown className="w-4 h-4" />}
            </div>
            <div>
              <p className="font-semibold text-ink">{entry.description || entry.type}</p>
              <p className="text-[11px] text-subtle font-mono mt-0.5 tracking-tighter">{new Date(entry.date).toLocaleString()}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-semibold tabular-nums ${
              entry.type === 'Receivable' ? 'text-success' : 'text-danger'
            }`}>
              {entry.type === 'Receivable' ? '+' : '-'}{formatCurrency(entry.amount)}
            </p>
            <p className="text-[11px] text-subtle uppercase tracking-wide font-semibold mt-0.5">
              Bal: {formatCurrency(entry.balanceSnapshot)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
