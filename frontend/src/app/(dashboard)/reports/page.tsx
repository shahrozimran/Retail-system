'use client';
import PageHeading from '@/components/PageHeading';
import { useMounted } from '@/hooks/useMounted';
import { API_URL, PROXY, apiFetch as fetch } from '@/lib/api';

import React, { useState } from 'react';
import useSWR from 'swr';
import { PieChart, Inbox, Loader2, Calendar, FileText, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import InvoiceModal from '@/components/InvoiceModal';


type Transaction = {
  id: string;
  date: string;
  productName: string;
  productSku: string;
  type: string;
  qtyChange: number;
  unitPrice: number;
  total: number;
  buyerName: string;
  description: string;
  batchId: string;
  customerUuid?: string;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP error: ' + res.status);
  return res.json();
};

export default function Reports() {
  const { data: finResponse, error: finError, isLoading: finLoading } = useSWR(
    API_URL ? `${PROXY}?action=reports` : null,
    fetcher,
    { shouldRetryOnError: false }
  );
  const { data: txResponse, error: txError, isLoading: txLoading } = useSWR(
    API_URL ? `${PROXY}?action=transactions` : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  const [period, setPeriod] = useState('all');
  const [now] = useState(() => new Date());
  const allTransactions: Transaction[] = Array.isArray(txResponse?.data) ? txResponse.data : [];
  const start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const transactions = allTransactions.filter(t => period === 'all' || new Date(t.date) >= start);
  const error = !API_URL ? 'The server is not configured.' : (finError || txError)?.message || (finResponse && !finResponse.success ? finResponse.message : '');
  const loading = finLoading || txLoading;

  const mounted = useMounted();
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);


  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(val);

  // Summary stats (Calculated from transactions for better consistency)
  const totalRevenue = transactions.filter(t => t.type === 'Out').reduce((s, t) => s + t.total, 0);
  const totalExpenses = transactions.filter(t => t.type === 'In').reduce((s, t) => s + t.total, 0);
  const netBalance = totalRevenue - totalExpenses;

  const statCards = [
    { label: 'Sales Revenue', value: formatCurrency(totalRevenue), icon: TrendingUp, color: 'text-success', bg: 'bg-success-soft border-success/20' },
    { label: 'Stock purchases', value: formatCurrency(totalExpenses), icon: TrendingDown, color: 'text-danger', bg: 'bg-surface border-line' },
    { label: 'Sales less purchases', value: formatCurrency(netBalance), icon: DollarSign, color: 'text-ink', bg: 'bg-surface border-line' },
  ];

  return (
    <div className="space-y-6 fade-in">
      <PageHeading title="Reports & invoices" description="Understand your sales, purchases and financial activity." actions={<select aria-label="Report period" value={period} onChange={e => setPeriod(e.target.value)} className="btn-secondary"><option value="all">All time</option><option value="7">Last 7 days</option><option value="month">This month</option></select>} />
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className={`p-5 rounded-xl border ${card.bg} flex items-center gap-4`}>
            <div className={`p-3 rounded-lg bg-emphasis/5 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-subtle font-semibold uppercase tracking-wider">{card.label}</p>
              <p className={`text-xl font-semibold tabular-nums mt-0.5 ${card.color}`}>{loading ? '—' : card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction Table */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PieChart className="w-5 h-5 text-subtle" />
            <div>
              <h2 className="text-xl font-semibold text-ink">Sales & Activity Report</h2>
              <p className="text-xs text-subtle mt-0.5">{transactions.length} transaction lines · {period === 'all' ? 'All time' : period === 'month' ? 'This month' : 'Last 7 days'}</p>
            </div>
          </div>
          <button
            onClick={() => setIsInvoiceOpen(true)}
            disabled={transactions.length === 0}
            className="flex items-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-40 text-on-brand px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            Generate Invoice
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-subtle" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-danger">{error}</div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-muted text-subtle text-[11px] uppercase tracking-wide border-b border-line">
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Product</th>
                  <th className="px-6 py-4 font-semibold">Buyer</th>
                  <th className="px-6 py-4 font-semibold text-center">Type</th>
                  <th className="px-6 py-4 font-semibold text-center">Qty</th>
                  <th className="px-6 py-4 font-semibold text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="px-6 py-4 text-subtle whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 shrink-0" />
                        {mounted ? new Date(t.date).toLocaleString() : '...'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-ink">{t.productName}</p>
                        <p className="text-[11px] text-subtle font-mono uppercase">{t.productSku}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-body">{t.buyerName || 'Walk-in Client'}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        t.type === 'Out'
                          ? 'bg-brand text-on-brand border-line'
                          : 'bg-danger-soft text-danger border-danger/20'
                      }`}>
                        {t.type === 'Out' ? 'SALE' : 'STOCK IN'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-semibold text-ink">
                      {t.qtyChange}
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold tabular-nums ${t.type === 'Out' ? 'text-success' : 'text-danger'}`}>
                      {t.type === 'Out' ? '+' : '-'}{formatCurrency(t.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && transactions.length === 0 && (
            <div className="p-12 text-center text-subtle">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No transaction history found for reports.</p>
            </div>
          )}
        </div>
      </div>

      <InvoiceModal
        isOpen={isInvoiceOpen}
        onClose={() => setIsInvoiceOpen(false)}
        transactions={transactions}
      />
    </div>
  );
}
