'use client';

import { useMemo, useState } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';

type Sale = { date: string; type: string; total: number };
const money = (value: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(value);

export default function SalesChart({ transactions }: { transactions: Sale[] }) {
  const [period, setPeriod] = useState(7);
  const [active, setActive] = useState<number | null>(null);
  const [now] = useState(() => new Date());
  const days = useMemo(() => {
    const key = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
      const date = new Date(transaction.date);
      if (transaction.type === 'Out' && Number.isFinite(date.getTime())) totals.set(key(date), (totals.get(key(date)) ?? 0) + transaction.total);
    }
    return Array.from({ length: period }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - period + index + 1);
      return { date, total: totals.get(key(date)) ?? 0 };
    });
  }, [transactions, period, now]);
  const maximum = Math.max(...days.map(day => day.total), 1);
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const selected = active === null ? null : days[active];

  return <section className="bg-surface border border-line rounded-2xl shadow-panel overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-6"><div><h2 className="font-semibold text-[15px]">Sales overview</h2><p className="text-xs text-subtle mt-1">Daily sales over the last {period} days</p></div><div className="flex p-1 bg-muted rounded-lg border border-line" aria-label="Sales chart period">{[7, 30].map(value => <button key={value} aria-pressed={period === value} onClick={() => { setPeriod(value); setActive(null); }} className={`text-[11px] px-3 py-1.5 rounded-md font-medium ${period === value ? 'bg-surface text-ink shadow-sm' : 'text-subtle hover:text-ink'}`}>{value} days</button>)}</div></div>
    <div className="px-6 mt-5 flex items-end justify-between gap-3"><div><p className="text-[26px] font-semibold tracking-tight tabular-nums">{money(selected?.total ?? total)}</p><p className="text-[11px] text-subtle mt-1" aria-live="polite">{selected ? selected.date.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Total sales in this period'}</p></div><span className="text-[10px] text-subtle flex items-center gap-1.5 mb-1"><span className="w-2 h-2 rounded-full bg-brand" /> Sales revenue</span></div>
    <div className="relative mx-6 mt-7 mb-5 h-[164px]" onMouseLeave={() => setActive(null)}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">{[0, 1, 2, 3].map(line => <div key={line} className="border-t border-dashed border-line" />)}</div>
      <div className="relative flex items-end gap-1 sm:gap-2 h-full">{days.map((day, index) => <div key={day.date.toISOString()} className="flex-1 min-w-0 flex flex-col h-full justify-end items-center gap-2"><button aria-label={`${day.date.toLocaleDateString()}: sales ${money(day.total)}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(active === index ? null : index)} className={`w-full max-w-12 rounded-t-[5px] transition-[height,background-color] duration-300 min-h-[3px] ${active === index ? 'bg-brand-hover' : day.total > 0 ? 'bg-brand/80 hover:bg-brand' : 'bg-emphasis'}`} style={{ height: `${day.total > 0 ? Math.max(4, day.total / maximum * 133) : 3}px` }} /><span className="h-4 text-[10px] text-subtle whitespace-nowrap">{period === 7 ? day.date.toLocaleDateString('en-PK', { weekday: 'short' }) : index % 5 === 0 || index === 29 ? day.date.getDate() : ''}</span></div>)}</div>
      {total === 0 && <div className="absolute inset-0 bottom-6 flex items-center justify-center pointer-events-none"><span className="bg-surface/95 border border-line rounded-lg px-4 py-3 text-xs text-subtle flex items-center gap-2"><ChartNoAxesCombined size={15} /> No sales recorded in this period</span></div>}
    </div>
  </section>;
}
