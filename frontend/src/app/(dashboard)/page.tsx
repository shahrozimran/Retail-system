'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { 
  Boxes, Wallet, AlertTriangle, TrendingUp, TrendingDown, 
  Clock, Package, ArrowRight, DollarSign, LayoutDashboard, Loader2
} from 'lucide-react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Product = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  minThreshold: number;
  price: number;
};

type Transaction = {
  id: string;
  date: string;
  productName: string;
  type: string;
  qtyChange: number;
  total: number;
  buyerName: string;
};

type DashboardStats = {
  totalInventoryValue: number;
  totalBalance: number;
  activeAlerts: number;
};

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function Dashboard() {
  const { data: statsRes, isLoading: statsLoading } = useSWR(API_URL ? `${API_URL}?action=dashboard` : null, fetcher);
  const { data: productsRes, isLoading: productsLoading } = useSWR(API_URL ? `${API_URL}?action=products` : null, fetcher);
  const { data: txRes, isLoading: txLoading } = useSWR(API_URL ? `${API_URL}?action=transactions` : null, fetcher);

  const stats: DashboardStats | null = statsRes?.data || null;
  const products: Product[] = Array.isArray(productsRes?.data) ? productsRes.data : [];
  const transactions: Transaction[] = Array.isArray(txRes?.data) ? txRes.data : [];

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(val);

  // Derived Data
  const lowStockItems = products.filter(p => p.stock <= p.minThreshold).slice(0, 4);
  const recentTx = transactions.slice(0, 5);
  
  // Calculate today's sales
  const [todaySales, setTodaySales] = useState(0);

  useEffect(() => {
    if (transactions.length > 0) {
      const today = new Date().toDateString();
      const sales = transactions
        .filter(t => t.type === 'Out' && t.date && new Date(t.date).toDateString() === today)
        .reduce((sum, t) => sum + (t.total || 0), 0);
      setTodaySales(sales);
    }
  }, [transactions]);

  if (!API_URL) {
    return <div className="p-8 bg-red-950/20 text-red-500 rounded-xl border border-red-900">NEXT_PUBLIC_API_URL not configured.</div>;
  }

  const isLoading = statsLoading || productsLoading || txLoading;

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-neutral-500" />
        <p className="text-neutral-500 font-medium">Syncing dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in pb-12">
      {/* Header with Quick Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-neutral-500" />
            Dashboard
          </h1>
          <p className="text-neutral-500 mt-1">Welcome back to Global Auto Parts management system.</p>
        </div>
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total Stock Value" 
          value={formatCurrency(stats?.totalInventoryValue || 0)} 
          icon={Boxes} 
          trend="+4.2%" 
          trendType="up"
        />
        <StatCard 
          label="Cash Balance" 
          value={formatCurrency(stats?.totalBalance || 0)} 
          icon={Wallet} 
        />
        <StatCard 
          label="Today's Sales" 
          value={formatCurrency(todaySales)} 
          icon={TrendingUp} 
          color="text-green-400"
        />
        <StatCard 
          label="Active Alerts" 
          value={String(stats?.activeAlerts || 0)} 
          icon={AlertTriangle} 
          color={stats?.activeAlerts && stats.activeAlerts > 0 ? "text-red-400" : "text-neutral-500"}
        />
      </div>

      {/* Main Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Recent Activity */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-base-950 border border-base-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-base-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-neutral-500" /> Recent Transactions
              </h3>
              <Link href="/transactions" className="text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1 transition-colors">
                VIEW ALL <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-base-900">
              {recentTx.length === 0 ? (
                <div className="p-12 text-center text-neutral-600">No recent transactions.</div>
              ) : (
                recentTx.map((tx) => (
                  <div key={tx.id} className="p-4 hover:bg-base-900/40 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl ${tx.type === 'Out' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
                        {tx.type === 'Out' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white group-hover:translate-x-1 transition-transform">{tx.productName}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          {tx.buyerName ? `Client: ${tx.buyerName}` : (tx.type === 'Out' ? 'Direct Sale' : 'Stock Replenishment')} &bull; {mounted && tx.date ? new Date(tx.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${tx.type === 'Out' ? 'text-white' : 'text-neutral-400'}`}>
                        {tx.type === 'Out' ? '+' : '-'}{formatCurrency(tx.total || 0)}
                      </p>
                      <p className="text-[10px] text-neutral-600 uppercase font-bold tracking-tighter mt-0.5">{tx.qtyChange} UNITS</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <QuickLinkCard title="Inventory Management" desc="Update stock levels and add new parts." href="/inventory" icon={Package} />
            <QuickLinkCard title="Financial Reports" desc="Generate invoices and view ledger." href="/reports" icon={DollarSign} />
          </div>
        </div>

        {/* Right Column: Alerts & Status */}
        <div className="space-y-6">
          <div className="bg-base-950 border border-base-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-base-800 bg-neutral-900/20">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" /> Low Stock Alerts
              </h3>
            </div>
            <div className="p-2">
              {lowStockItems.length === 0 ? (
                <div className="p-8 text-center text-neutral-600 text-xs italic">All stock levels healthy.</div>
              ) : (
                lowStockItems.map(item => (
                  <div key={item.id} className="p-3 flex items-center justify-between hover:bg-white/5 rounded-xl transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-neutral-500 font-medium">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end">
                         <span className="text-xs font-black text-red-400">{item.stock}</span>
                         <span className="text-[9px] text-neutral-600 uppercase">LEFT</span>
                      </div>
                      <div className="w-16 h-1 bg-neutral-900 rounded-full mt-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-red-500" 
                          style={{ width: `${Math.max(5, (item.stock / (item.minThreshold || 1)) * 100)}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {lowStockItems.length > 0 && (
              <Link href="/inventory" className="block p-4 text-center text-xs font-bold text-neutral-500 hover:text-white border-t border-base-800 transition-colors bg-base-900/20">
                MANAGE ALL INVENTORY
              </Link>
            )}
          </div>

          <div className="bg-gradient-to-br from-neutral-900 to-black border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-24 h-24 text-white" />
            </div>
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1">Store Performance</p>
            <h4 className="text-xl font-bold text-white">Efficiency is high</h4>
            <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
              Your inventory value has increased by <span className="text-white font-bold">8%</span> this week. Keep tracking sales to optimize stock!
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = "text-white", trend, trendType }: any) {
  return (
    <div className="bg-base-950 border border-base-800 rounded-2xl p-6 shadow-sm group hover:border-neutral-700 transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 bg-neutral-900 rounded-xl group-hover:bg-neutral-800 transition-colors">
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        {trend && (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${trendType === 'up' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{label}</p>
      <h3 className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</h3>
    </div>
  );
}

function QuickLinkCard({ title, desc, href, icon: Icon }: any) {
  return (
    <Link href={href} className="flex items-start gap-4 p-5 bg-base-950 border border-base-800 rounded-2xl hover:border-white/20 transition-all group">
      <div className="p-3 bg-neutral-900 rounded-xl group-hover:bg-white group-hover:text-black transition-all">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className="font-bold text-white group-hover:text-white transition-colors">{title}</h4>
        <p className="text-xs text-neutral-500 mt-1">{desc}</p>
      </div>
    </Link>
  );
}
