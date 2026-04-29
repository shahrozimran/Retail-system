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
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  // Summary stats
  const totalRevenue = finances.filter(f => f.category === 'Sales').reduce((s, f) => s + f.credit, 0);
  const totalExpenses = finances.filter(f => f.category === 'Expenses').reduce((s, f) => s + f.debit, 0);
  const netBalance = finances.length > 0 ? finances[0].balanceSnapshot : 0;

  const statCards = [
    { label: 'Total Revenue', value: formatCurrency(totalRevenue), icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-950/20 border-green-900/40' },
    { label: 'Total Expenses', value: formatCurrency(totalExpenses), icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-950/20 border-red-900/40' },
    { label: 'Net Balance', value: formatCurrency(netBalance), icon: DollarSign, color: 'text-white', bg: 'bg-white/5 border-white/10' },
  ];

  return (
    <div className="space-y-6 fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* Ledger table */}
      <div className="bg-base-950 border border-base-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-base-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PieChart className="w-5 h-5 text-neutral-500" />
            <div>
              <h2 className="text-xl font-bold text-white">Financial Ledger</h2>
              <p className="text-xs text-neutral-500 mt-0.5">{finances.length} records</p>
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
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-base-900 text-neutral-400 text-xs uppercase tracking-wider border-b border-base-800">
                  <th className="px-6 py-4 font-bold">Date</th>
                  <th className="px-6 py-4 font-bold">Category</th>
                  <th className="px-6 py-4 font-bold text-right">Debit (Expense)</th>
                  <th className="px-6 py-4 font-bold text-right">Credit (Income)</th>
                  <th className="px-6 py-4 font-bold text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800 text-sm">
                {finances.map((f, index) => (
                  <tr key={index} className="hover:bg-base-900/50 transition-colors group">
                    <td className="px-6 py-4 text-neutral-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 shrink-0" />
                        {mounted ? new Date(f.date).toLocaleString() : '...'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                        f.category === 'Sales'
                          ? 'bg-white text-black border-white'
                          : 'bg-neutral-900 text-neutral-300 border-neutral-700'
                      }`}>
                        {f.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-red-400 tabular-nums">
                      {f.debit > 0 ? formatCurrency(f.debit) : <span className="text-neutral-700">-</span>}
                    </td>
                    <td className="px-6 py-4 text-right text-green-400 font-medium tabular-nums">
                      {f.credit > 0 ? formatCurrency(f.credit) : <span className="text-neutral-700">-</span>}
                    </td>
                    <td className={`px-6 py-4 text-right font-bold tabular-nums ${f.balanceSnapshot >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {formatCurrency(f.balanceSnapshot)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!finLoading && !error && finances.length === 0 && (
            <div className="p-12 text-center text-neutral-500">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No financial records found.</p>
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
