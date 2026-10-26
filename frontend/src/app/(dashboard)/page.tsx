'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Boxes, CalendarDays, CheckCheck, CircleAlert, Factory, Package, Plus, ShoppingBag, Wallet } from 'lucide-react';
import { API_URL, PROXY, apiFetch } from '@/lib/api';
import { useMounted } from '@/hooks/useMounted';
import PageHeading from '@/components/PageHeading';
import SalesChart from '@/components/SalesChart';
import TransactionModal from '@/components/TransactionModal';

type Product = { uuid: string; name: string; sku: string; quantity: number; minStock: number };
type Transaction = { id: string; date: string; productName: string; type: string; qtyChange: number; total: number; buyerName: string };
const fetcher = async (url: string) => { const response = await apiFetch(url); if (!response.ok) throw new Error('Could not load workspace data.'); return response.json(); };
const money = (value: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(value);

export default function Dashboard() {
  const { data: statsRes, isLoading: statsLoading, error: statsError, mutate } = useSWR(`${PROXY}?action=dashboard`, fetcher);
  const { data: productsRes, isLoading: productsLoading, error: productsError, mutate: reloadProducts } = useSWR(`${PROXY}?action=products`, fetcher);
  const { data: txRes, isLoading: txLoading, error: txError, mutate: reloadTransactions } = useSWR(`${PROXY}?action=transactions`, fetcher);
  const mounted = useMounted();
  const [now] = useState(() => new Date());
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const stats = statsRes?.data;
  const products: Product[] = Array.isArray(productsRes?.data) ? productsRes.data : [];
  const transactions: Transaction[] = Array.isArray(txRes?.data) ? txRes.data : [];
  const lowStock = products.filter(product => product.quantity <= product.minStock);
  const today = transactions.filter(t => t.type === 'Out' && new Date(t.date).toDateString() === now.toDateString());
  const isLoading = statsLoading || productsLoading || txLoading;
  const error = !API_URL || statsError || productsError || txError;
  const cards = [
    { label: 'Inventory value', value: money(stats?.totalInventoryValue ?? 0), detail: `${products.length} products in your catalog`, icon: Boxes, color: 'text-brand-ink bg-brand-soft' },
    { label: 'Cash balance', value: money(stats?.totalBalance ?? 0), detail: 'Current business account balance', icon: Wallet, color: 'text-info bg-info-soft' },
    { label: 'Sales today', value: money(today.reduce((sum, t) => sum + t.total, 0)), detail: `${today.length} sales line${today.length === 1 ? '' : 's'} recorded today`, icon: ShoppingBag, color: 'text-success bg-success-soft' },
    { label: 'Stock alerts', value: String(lowStock.length), detail: lowStock.length ? 'Products at or below minimum stock' : 'All products above minimum stock', icon: CircleAlert, color: 'text-warning bg-warning-soft' },
  ];

  return <div className="fade-in space-y-6 pb-6">
    <PageHeading title="Business overview" description="A clear picture of your stock, sales and daily activity." actions={<><span className="hidden xl:flex items-center gap-2 text-xs text-subtle mr-2"><CalendarDays size={15} />{mounted ? now.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Today'}</span><button onClick={() => setTransactionOpen(true)} className="btn-primary"><Plus size={16} /> Record transaction</button></>} />
    {notice && <div role="status" className="bg-success-soft text-success border border-success/20 rounded-xl p-3 flex items-center gap-2 text-sm"><CheckCheck size={17} />{notice}<button onClick={() => setNotice('')} className="ml-auto text-xs underline">Dismiss</button></div>}
    {error && <div role="alert" className="p-4 rounded-xl border border-danger/20 bg-danger-soft text-danger flex items-center gap-3 text-sm"><CircleAlert size={18} /><span>Some workspace data could not be loaded.</span><button onClick={() => { mutate(); reloadProducts(); reloadTransactions(); }} className="underline ml-auto">Try again</button></div>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 stagger">{cards.map(card => <div className="stat-card min-w-0" key={card.label}><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-body">{card.label}</p><span className={`p-2 rounded-lg ${card.color}`}><card.icon size={17} strokeWidth={1.7} /></span></div>{isLoading ? <div className="skeleton h-8 w-3/4 mt-3 mb-3" /> : <p className="text-[24px] 2xl:text-[27px] tracking-tight font-semibold tabular-nums mt-2 break-words">{card.value}</p>}<p className="text-[11px] text-subtle mt-2">{card.detail}</p></div>)}</div>
    <div className="grid xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)] gap-6">
      <SalesChart transactions={transactions} />
      <section className="bg-surface border border-line rounded-2xl shadow-panel overflow-hidden flex flex-col">
        <div className="px-5 py-5 border-b border-line flex items-center justify-between"><h2 className="font-semibold text-[15px]">Stock watch</h2><span className="text-[11px] font-medium text-warning bg-warning-soft px-2 py-1 rounded-md">{lowStock.length} alerts</span></div>
        <div className="flex-1 p-2">{isLoading ? <div className="p-4 space-y-4">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10" />)}</div> : lowStock.length ? lowStock.slice(0, 4).map(product => <Link href="/inventory" key={product.uuid} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted"><span className="p-2.5 bg-muted rounded-lg text-subtle"><Package size={17} /></span><span className="min-w-0 flex-1"><span className="block font-medium text-xs truncate">{product.name}</span><span className="text-[11px] text-subtle block mt-1">{product.sku} · Min. {product.minStock}</span></span><span className="text-right"><span className="text-sm font-semibold text-warning block">{product.quantity}</span><span className="text-[11px] text-subtle">in stock</span></span></Link>) : <div className="h-full min-h-40 flex flex-col items-center justify-center p-7 text-center"><span className="p-3 rounded-full bg-success-soft text-success mb-3"><CheckCheck size={22} /></span><p className="text-sm font-medium">{products.length ? 'Stock is looking healthy' : 'Your catalog starts here'}</p><p className="text-xs text-subtle mt-1.5 leading-relaxed">{products.length ? 'No products are below their minimum stock level.' : 'Add products to start tracking stock levels.'}</p></div>}</div>
        <Link href="/inventory" className="flex items-center justify-between px-5 py-3.5 text-xs text-brand-ink font-medium border-t border-line hover:bg-muted">Manage inventory <ArrowRight size={14} /></Link>
      </section>
    </div>
    <div className="grid xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)] gap-6">
      <section className="bg-surface border border-line rounded-2xl shadow-panel overflow-hidden">
        <div className="px-6 py-5 border-b border-line flex items-center justify-between"><div><h2 className="font-semibold text-[15px]">Recent activity</h2><p className="text-xs text-subtle mt-1">Your latest sales and stock movements</p></div><Link href="/transactions" className="text-xs text-brand-ink font-medium flex gap-1 items-center">View all <ArrowUpRight size={14} /></Link></div>
        <div className="divide-y divide-line">{isLoading ? <div className="p-6 space-y-5">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10" />)}</div> : transactions.length ? transactions.slice(0, 5).map(tx => <div key={tx.id} className="flex items-center gap-3 px-5 py-4 hover:bg-muted"><span className={`p-2.5 rounded-lg ${tx.type === 'Out' ? 'bg-success-soft text-success' : 'bg-info-soft text-info'}`}>{tx.type === 'Out' ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}</span><div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{tx.productName}</p><p className="text-[11px] text-subtle mt-1 truncate">{tx.buyerName || (tx.type === 'Out' ? 'Direct sale' : 'Stock received')} · {tx.qtyChange} units</p></div><div className="text-right shrink-0"><p className="text-xs font-semibold tabular-nums">{money(tx.total)}</p><p className="text-[11px] text-subtle mt-1">{mounted && tx.date ? new Date(tx.date).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' }) : ''}</p></div></div>) : <div className="p-10 text-center"><ShoppingBag size={27} className="mx-auto text-subtle mb-3" /><p className="text-sm font-medium">Ready for your first transaction</p><p className="text-xs text-subtle mt-2">Sales and stock movements will appear here.</p><Link href="/transactions" className="inline-flex items-center gap-1.5 text-xs text-brand-ink font-medium mt-4">Go to transactions <ArrowRight size={13} /></Link></div>}</div>
      </section>
      <section className="space-y-3"><p className="section-label px-1 pt-1 pb-1">Keep things moving</p>{[{ title: 'Manage products', text: 'Review pricing and available stock.', href: '/inventory', icon: Package }, { title: 'Plan a production run', text: 'Make the most of your materials.', href: '/production', icon: Factory }, { title: 'Review your finances', text: 'See reports and create invoices.', href: '/reports', icon: Wallet }].map(action => <Link href={action.href} key={action.href} className="flex items-center gap-3 p-4 bg-surface border border-line rounded-xl hover:border-brand/40 group"><span className="p-2.5 bg-muted rounded-lg text-subtle group-hover:text-brand-ink"><action.icon size={18} strokeWidth={1.7} /></span><span className="flex-1"><span className="text-xs font-semibold block">{action.title}</span><span className="text-[11px] text-subtle mt-1 block">{action.text}</span></span><ArrowUpRight size={15} className="text-subtle group-hover:text-brand-ink" /></Link>)}</section>
    </div>
    <TransactionModal isOpen={transactionOpen} onClose={() => setTransactionOpen(false)} onSuccess={message => { setNotice(message); mutate(); reloadProducts(); reloadTransactions(); }} />
  </div>;
}
