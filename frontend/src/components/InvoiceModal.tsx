'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Building2, Check, Download, FileText, Loader2, Printer, Search, SlidersHorizontal, User, X } from 'lucide-react';
import Dialog from './Dialog';
import InvoicePreview from './InvoicePreview';
import { API_URL, PROXY, apiFetch } from '@/lib/api';
import { DESKTOP, saveDesktopInvoice } from '@/lib/desktop';
import { invoiceDate, invoiceDueDate, invoiceError, invoiceMoney, invoiceTotals, type InvoiceDraft, type InvoiceTransaction } from '@/lib/invoice';

type Customer = { uuid: string; name: string; balance: number; phone: string; email?: string; address?: string };
type Props = { isOpen: boolean; onClose: () => void; transactions: InvoiceTransaction[] };
const fetcher = async (url: string) => { const response = await apiFetch(url); if (!response.ok) throw new Error('Customer accounts could not be loaded.'); return response.json(); };
const field = 'field !text-xs !py-2.5';

export default function InvoiceModal(props: Props) {
  return props.isOpen ? <InvoiceContent {...props} /> : null;
}

function InvoiceContent({ onClose, transactions }: Props) {
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState('items');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [invoiceNo, setInvoiceNo] = useState(() => `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`);
  const [issueDate, setIssueDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [dueDate, setDueDate] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [companyName, setCompanyName] = useState('Global Auto Parts');
  const [companyAddress, setCompanyAddress] = useState('House 10A Street 25B New Wassan Pura Lahore');
  const [companyEmail, setCompanyEmail] = useState('aifunk62@gmail.com');
  const [companyPhone, setCompanyPhone] = useState('03114437441');
  const [clientSearch, setClientSearch] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('Thank you for your business!');
  const [showAccountBalance, setShowAccountBalance] = useState(false);
  const [includeStockIn, setIncludeStockIn] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: customersResponse, error: customerError } = useSWR(API_URL ? `${PROXY}?action=customers` : null, fetcher);
  const customers: Customer[] = useMemo(() => Array.isArray(customersResponse?.data) ? customersResponse.data : [], [customersResponse]);
  const selectedCustomer = customers.find(customer => customer.name.toLowerCase() === clientSearch.toLowerCase() || `[${customer.phone || 'No phone'}] ${customer.name}`.toLowerCase() === clientSearch.toLowerCase());
  const clientName = selectedCustomer?.name ?? clientSearch;

  function updateClient(value: string) {
    setClientSearch(value);
    const customer = customers.find(customer => customer.name.toLowerCase() === value.toLowerCase() || `[${customer.phone || 'No phone'}] ${customer.name}`.toLowerCase() === value.toLowerCase());
    setClientAddress(customer?.address ?? ''); setClientEmail(customer?.email ?? '');
  }

  // Search narrows the picker only. Date/customer/type filters define the
  // invoice scope, and hidden selections outside that scope are not exported.
  const scoped = transactions.filter(item => {
    if (selectedCustomer && item.customerUuid !== selectedCustomer.uuid) return false;
    if (!includeStockIn && item.type !== 'Out') return false;
    if (dateFrom && new Date(item.date) < new Date(`${dateFrom}T00:00:00`)) return false;
    if (dateTo && new Date(item.date) > new Date(`${dateTo}T23:59:59.999`)) return false;
    return true;
  });
  const shown = scoped.filter(item => `${item.productName} ${item.productSku} ${item.buyerName}`.toLowerCase().includes(search.toLowerCase()));
  const selected = scoped.filter(item => selectedIds.has(item.id));
  const draft: InvoiceDraft = { invoiceNo, issueDate, dueDate, taxRate: Number(taxRate), companyName, companyAddress, companyEmail, companyPhone, clientName, clientAddress, clientEmail, notes, transactions: selected, ...(selectedCustomer && showAccountBalance ? { accountBalance: selectedCustomer.balance } : {}) };
  const validation = dateFrom && dateTo && dateFrom > dateTo ? 'The transaction start date must be before its end date.' : invoiceError(draft);
  let totals = { subtotal: 0, tax: 0, total: 0 };
  try { totals = invoiceTotals(selected, Number(taxRate)); } catch { /* Validation explains invalid financial values before export. */ }

  function toggle(id: string) {
    setSelectedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setError(''); setStatus('');
  }

  async function generate(print = false) {
    if (generating) return;
    if (validation) { setError(validation); return; }
    setGenerating(true); setError(''); setStatus('');
    try {
      const { createInvoicePdf } = await import('@/lib/invoice-pdf');
      const document = createInvoicePdf(draft);
      const filename = `${invoiceNo.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)}.pdf`;
      if (DESKTOP) {
        const completed = await saveDesktopInvoice(document.output('arraybuffer'), filename, print);
        setStatus(completed ? print ? 'Invoice opened in your PDF reader for preview and printing.' : 'Invoice saved successfully.' : 'Save cancelled. Your invoice details are still here.');
      } else { document.save(filename); setStatus(`PDF prepared with ${document.getNumberOfPages()} page${document.getNumberOfPages() === 1 ? '' : 's'}.`); }
    } catch (error) { setError(error instanceof Error ? error.message : 'The PDF could not be created. Your invoice details are still here.'); }
    finally { setGenerating(false); }
  }

  const sections = [{ key: 'items', label: '1. Select items' }, { key: 'details', label: '2. Invoice details' }, { key: 'preview', label: '3. Preview' }];
  return <Dialog label="Invoice builder" busy={generating} onClose={onClose}>
    <div className="absolute inset-0 bg-[#091822]/60 backdrop-blur-sm modal-backdrop" onClick={() => { if (!generating) onClose(); }} />
    <section className="modal-panel relative w-full max-w-[1440px] h-[92dvh] bg-surface border border-line rounded-2xl shadow-dialog flex flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-line shrink-0"><div className="flex items-center gap-3"><span className="p-2.5 bg-brand-soft text-brand-ink rounded-xl"><FileText size={20} /></span><div><h2 className="font-semibold text-lg">Invoice builder</h2><p className="text-xs text-subtle mt-0.5">Choose your items, add the details, and review before exporting.</p></div></div><button disabled={generating} onClick={onClose} aria-label="Close invoice builder" className="icon-button shrink-0"><X size={17} /></button></header>
      <nav aria-label="Invoice builder steps" className="xl:hidden flex gap-1 p-2 border-b border-line shrink-0">{sections.map(section => <button key={section.key} onClick={() => setTab(section.key)} aria-pressed={tab === section.key} className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-medium ${tab === section.key ? 'bg-brand-soft text-brand-ink' : 'text-subtle hover:bg-muted'}`}>{section.label}</button>)}</nav>
      <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[280px_320px_minmax(0,1fr)]">
        <section className={`${tab === 'items' ? 'flex' : 'hidden'} xl:flex flex-col h-full min-h-0 border-r border-line`} aria-label="Select invoice items">
          <div className="p-4 border-b border-line space-y-3"><h3 className="text-sm font-semibold">Transactions <span className="text-subtle text-xs font-normal ml-1">{selected.length} selected</span></h3><div className="relative"><Search size={15} className="absolute top-3 left-3 text-subtle" /><input aria-label="Search invoice transactions" value={search} onChange={event => setSearch(event.target.value)} placeholder="Product, SKU or customer…" className={`${field} !pl-9`} /></div><div className="grid grid-cols-2 gap-2"><div><label className="field-label !text-[10px]" htmlFor="invoice-from">From</label><input id="invoice-from" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className={`${field} !px-2`} /></div><div><label className="field-label !text-[10px]" htmlFor="invoice-to">To</label><input id="invoice-to" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className={`${field} !px-2`} /></div></div><label className="flex items-center gap-2 text-xs text-subtle"><input type="checkbox" checked={includeStockIn} onChange={event => setIncludeStockIn(event.target.checked)} /> Include stock-in entries</label><div className="flex items-center justify-between text-xs"><button className="text-brand-ink font-medium" onClick={() => setSelectedIds(current => new Set([...current, ...shown.map(item => item.id)]))}>Select shown</button><button className="text-subtle hover:text-ink" onClick={() => setSelectedIds(new Set())}>Clear selection</button></div></div>
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-line">{shown.length ? shown.map(item => <label key={item.id} className={`flex gap-3 items-start p-4 cursor-pointer hover:bg-muted transition-colors ${selectedIds.has(item.id) ? 'bg-brand-soft/50' : ''}`}><input type="checkbox" aria-label={`Select ${item.productName}, ${invoiceDate(item.date)}, ${invoiceMoney(item.total)}`} checked={selectedIds.has(item.id)} onChange={() => toggle(item.id)} className="mt-1 shrink-0" /><span className="flex-1 min-w-0"><span className="block text-xs font-semibold break-words">{item.productName}</span><span className="block text-[10px] text-subtle mt-1">{item.productSku} · {invoiceDate(item.date)}</span><span className="flex flex-wrap items-center gap-2 justify-between mt-2 text-[11px]"><span className="text-subtle">{item.qtyChange} units · {item.type === 'Out' ? 'Sale' : 'Stock in'}</span><span className="font-medium tabular-nums">{invoiceMoney(item.total)}</span></span>{item.buyerName && <span className="block text-[10px] text-subtle mt-1 truncate">{item.buyerName}</span>}</span></label>) : <div className="p-8 text-center text-xs text-subtle leading-relaxed">No transactions match these filters. Try another date range or customer.</div>}</div>
        </section>
        <section aria-label="Invoice details" className={`${tab === 'details' ? 'block' : 'hidden'} xl:block h-full overflow-y-auto min-h-0 p-5 space-y-6 border-r border-line`}>
          {customerError && <p className="text-xs text-warning bg-warning-soft rounded-lg p-3">Customer accounts could not be loaded. You can enter a customer name manually.</p>}
          <div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal size={15} className="text-brand-ink" /> Invoice details</h3><div><label htmlFor="invoice-number" className="field-label">Invoice number</label><input id="invoice-number" maxLength={80} value={invoiceNo} onChange={event => setInvoiceNo(event.target.value)} className={field} /></div><div className="grid grid-cols-2 gap-3"><div><label htmlFor="invoice-issued" className="field-label">Issue date</label><input id="invoice-issued" type="date" required value={issueDate} onChange={event => setIssueDate(event.target.value)} className={field} /></div><div><label htmlFor="invoice-due" className="field-label">Due date</label><input id="invoice-due" type="date" min={issueDate} value={dueDate} onChange={event => setDueDate(event.target.value)} className={field} /></div></div><div className="flex gap-1.5">{[7, 14, 30].map(days => <button key={days} type="button" onClick={() => setDueDate(invoiceDueDate(issueDate, days))} className="flex-1 px-2 py-1.5 text-[10px] text-brand-ink bg-brand-soft rounded-md hover:bg-emphasis">Due in {days} days</button>)}</div><div><label htmlFor="invoice-tax" className="field-label">Tax rate (%)</label><input id="invoice-tax" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={event => setTaxRate(event.target.value.replace(/^0+(?=\d)/, ''))} className={field} /></div></div>
          <div className="space-y-3 border-t border-line pt-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 size={15} className="text-brand-ink" /> Your business</h3><div><label htmlFor="invoice-company" className="field-label">Business name</label><input id="invoice-company" maxLength={160} value={companyName} onChange={event => setCompanyName(event.target.value)} className={field} /></div><div><label htmlFor="invoice-address" className="field-label">Business address</label><textarea id="invoice-address" maxLength={600} value={companyAddress} onChange={event => setCompanyAddress(event.target.value)} rows={2} className={field} /></div><div><label htmlFor="invoice-email" className="field-label">Business email</label><input id="invoice-email" type="email" maxLength={254} value={companyEmail} onChange={event => setCompanyEmail(event.target.value)} className={field} /></div><div><label htmlFor="invoice-phone" className="field-label">Business phone</label><input id="invoice-phone" maxLength={60} value={companyPhone} onChange={event => setCompanyPhone(event.target.value)} className={field} /></div></div>
          <div className="space-y-3 border-t border-line pt-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><User size={15} className="text-brand-ink" /> Bill to</h3><div><label htmlFor="invoice-client" className="field-label">Customer name</label><input id="invoice-client" maxLength={160} list="invoice-customers" placeholder="Find a customer or enter a name" value={clientSearch} onChange={event => updateClient(event.target.value)} className={field} /><datalist id="invoice-customers">{customers.map(customer => <option key={customer.uuid} value={`[${customer.phone || 'No phone'}] ${customer.name}`} />)}</datalist></div><div><label htmlFor="invoice-client-address" className="field-label">Customer address</label><textarea id="invoice-client-address" maxLength={600} rows={2} value={clientAddress} onChange={event => setClientAddress(event.target.value)} className={field} /></div><div><label htmlFor="invoice-client-email" className="field-label">Customer email</label><input id="invoice-client-email" type="email" maxLength={254} value={clientEmail} onChange={event => setClientEmail(event.target.value)} className={field} /></div>{selectedCustomer && <label className="flex items-start gap-2 text-xs leading-relaxed text-subtle p-3 border border-line rounded-lg"><input type="checkbox" checked={showAccountBalance} onChange={event => setShowAccountBalance(event.target.checked)} className="mt-0.5" /><span>Show account balance separately<br /><span className="text-[10px]">For reference; it does not change the invoice total.</span></span></label>}</div>
          <div className="border-t border-line pt-5"><label htmlFor="invoice-notes" className="field-label">Notes & payment terms</label><textarea id="invoice-notes" maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} rows={4} className={field} /><p className="text-[10px] text-subtle mt-1 text-right">{notes.length} / 4,000</p></div>
        </section>
        <section aria-label="Invoice preview" className={`${tab === 'preview' ? 'block' : 'hidden'} xl:block h-full overflow-y-auto min-h-0 bg-muted p-4 sm:p-6`}><div className="flex items-center justify-between mb-4"><h3 className="text-xs font-semibold text-body">Live layout preview</h3><span className="text-[10px] text-subtle">A4 · Portrait</span></div><InvoicePreview draft={draft} totals={totals} /></section>
      </div>
      <footer className="border-t border-line bg-surface p-4 sm:px-6 shrink-0 space-y-3">
        {error && <p role="alert" className="text-sm text-danger bg-danger-soft rounded-lg p-3">{error}</p>}
        {status && <p role="status" className="flex items-center gap-2 text-xs text-success"><Check size={14} />{status}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium">{selected.length} item{selected.length === 1 ? '' : 's'} selected <span className="text-subtle font-normal">· Total due</span> <span className="font-semibold tabular-nums ml-1">{invoiceMoney(totals.total)}</span></p><p className="text-[11px] text-subtle mt-1">{validation || (includeStockIn ? 'Stock-in entries are included in this document total.' : 'Ready to export. All selected items will be included.')}</p></div><div className="flex gap-2 w-full sm:w-auto"><button disabled={generating} onClick={onClose} className="btn-secondary">Close</button><button disabled={generating || Boolean(validation)} onClick={() => generate()} className="btn-primary flex-1 sm:flex-none disabled:opacity-50">{generating ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {generating ? 'Preparing…' : 'Export PDF'}</button>{DESKTOP && <button disabled={generating || Boolean(validation)} onClick={() => generate(true)} className="btn-secondary disabled:opacity-50" title="Open the invoice in your PDF reader for preview and printing"><Printer size={15} /> Print PDF</button>}</div></div>
      </footer>
    </section>
  </Dialog>;
}
