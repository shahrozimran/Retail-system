'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { PieChart, Inbox, Loader2, Calendar, FileText, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import InvoiceModal from '@/components/InvoiceModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type FinanceRecord = {
  date: string;
  category: string;
  debit: number;
  credit: number;
  balanceSnapshot: number;
};

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
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP error: ' + res.status);
  return res.json();
};

export default function Reports() {
  const { data: finResponse, error: finError, isLoading: finLoading } = useSWR(
    API_URL ? `${API_URL}?action=reports` : null,
    fetcher,
    { shouldRetryOnError: false }
  );
  const { data: txResponse } = useSWR(
    API_URL ? `${API_URL}?action=transactions` : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  const finances: FinanceRecord[] = finResponse?.data || [];
  const transactions: Transaction[] = txResponse?.data || [];
  const error = !API_URL ? 'API_URL not set.' : (finError ? finError.message : (finResponse && !finResponse.success ? finResponse.message : ''));

  const [mounted, setMounted] = useState(false);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(val);

  // Summary stats (Calculated from transactions for better consistency)
  const totalRevenue = transactions.filter(t => t.type === 'Out').reduce((s, t) => s + t.total, 0);
  const totalExpenses = transactions.filter(t => t.type === 'In').reduce((s, t) => s + t.total, 0);
  const netBalance = totalRevenue - totalExpenses;

  const statCards = [
    { label: 'Sales Revenue', value: formatCurrency(totalRevenue), icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-950/20 border-green-900/40' },
    { label: 'Returns/Expenses', value: formatCurrency(totalExpenses), icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-950/20 border-red-900/40' },
    { label: 'Net Profit/Loss', value: formatCurrency(netBalance), icon: DollarSign, color: 'text-white', bg: 'bg-white/5 border-white/10' },
  ];

  return (
    <div className="space-y-6 fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className={`p-5 rounded-xl border ${card.bg} flex items-center gap-4`}>
            <div className={`p-3 rounded-lg bg-white/5 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider">{card.label}</p>
              <p className={`text-xl font-bold tabular-nums mt-0.5 ${card.color}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction Table */}
      <div className="bg-base-950 border border-base-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-base-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PieChart className="w-5 h-5 text-neutral-500" />
            <div>
              <h2 className="text-xl font-bold text-white">Sales & Activity Report</h2>
              <p className="text-xs text-neutral-500 mt-0.5">{transactions.length} total transactions</p>
            </div>
          </div>
          <button
            onClick={() => setIsInvoiceOpen(true)}
            disabled={transactions.length === 0}
            className="flex items-center gap-2 bg-white hover:bg-neutral-200 disabled:opacity-40 text-black px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            Generate Invoice
          </button>
        </div>

        <div className="overflow-x-auto">
          {finLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">{error}</div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-base-900 text-neutral-400 text-[10px] uppercase tracking-widest border-b border-base-800">
                  <th className="px-6 py-4 font-bold">Date</th>
                  <th className="px-6 py-4 font-bold">Product</th>
                  <th className="px-6 py-4 font-bold">Buyer</th>
                  <th className="px-6 py-4 font-bold text-center">Type</th>
                  <th className="px-6 py-4 font-bold text-center">Qty</th>
                  <th className="px-6 py-4 font-bold text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800 text-sm">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-base-900/50 transition-colors group">
                    <td className="px-6 py-4 text-neutral-400 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 shrink-0" />
                        {mounted ? new Date(t.date).toLocaleString() : '...'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-bold text-white">{t.productName}</p>
                        <p className="text-[10px] text-neutral-500 font-mono uppercase">{t.productSku}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-neutral-300">{t.buyerName || 'Walk-in Client'}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                        t.type === 'Out'
                          ? 'bg-white text-black border-white'
                          : 'bg-red-950/30 text-red-400 border-red-900/50'
                      }`}>
                        {t.type === 'Out' ? 'SALE' : 'RETURN'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-white">
                      {t.qtyChange}
                    </td>
                    <td className={`px-6 py-4 text-right font-bold tabular-nums ${t.type === 'Out' ? 'text-green-400' : 'text-red-400'}`}>
                      {t.type === 'Out' ? '+' : '-'}{formatCurrency(t.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!finLoading && !error && transactions.length === 0 && (
            <div className="p-12 text-center text-neutral-500">
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
