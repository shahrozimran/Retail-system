'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, Download, Loader2, Building2, User, Hash, Calendar, CheckSquare, Square } from 'lucide-react';

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

type InvoiceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
};

const inputClass =
  'w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white placeholder-zinc-600';

export default function InvoiceModal({ isOpen, onClose, transactions }: InvoiceModalProps) {
  const [generating, setGenerating] = useState(false);

  // Invoice meta fields
  const [invoiceNo, setInvoiceNo] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  
  // Permanent Company Defaults
  const [companyName, setCompanyName] = useState('Global Auto Parts');
  const [companyAddress, setCompanyAddress] = useState('House 10A Street 25B New Wassan Pura Lahore');
  const [companyEmail, setCompanyEmail] = useState('aifunk62@gmail.com');
  const [companyPhone, setCompanyPhone] = useState('03114437441');
  
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('Thank you for your business!');
  const [taxRate, setTaxRate] = useState('0');

  // Filter & Selection states
  const [includeExpenses, setIncludeExpenses] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredTx = transactions.filter((t) => {
    if (!includeExpenses && t.type !== 'Out') return false;
    if (dateFrom && new Date(t.date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(t.date) > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  const selectedTx = filteredTx.filter((t) => selectedIds.has(t.id));

  const subtotal = selectedTx.reduce((s, t) => s + t.total, 0);
  const tax = subtotal * (Number(taxRate) / 100);
  const grandTotal = subtotal + tax;

  const fmt = (v: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PKR' }).format(v);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredTx.map((t) => t.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleGenerate = async () => {
    if (selectedTx.length === 0) return;
    setGenerating(true);
    try {
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentW = pageW - margin * 2;

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setFillColor(0, 0, 0);
      doc.rect(0, 0, pageW, 1.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(0, 0, 0);
      doc.text(companyName || 'Global Auto Parts', margin, 22);

      if (companyAddress) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
        doc.text(companyAddress, margin, 28);
      }
      const contactLine = [companyEmail, companyPhone].filter(Boolean).join('  |  ');
      if (contactLine) {
        doc.setFontSize(8); doc.setTextColor(100, 100, 100);
        doc.text(contactLine, margin, companyAddress ? 33 : 28);
      }

      doc.setFont('helvetica', 'bold'); doc.setFontSize(32); doc.setTextColor(0, 0, 0);
      doc.text('INVOICE', pageW - margin, 22, { align: 'right' });

      const metaStartY = 28;
      const metaLines: [string, string][] = [
        ['Invoice No:', invoiceNo],
        ['Issue Date:', new Date(issueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
      ];
      if (dueDate) metaLines.push(['Due Date:', new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })]);

      doc.setFontSize(8);
      metaLines.forEach(([label, value], i) => {
        const y = metaStartY + i * 5.5;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(label, pageW - margin - 35, y, { align: 'left' });
        doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
        doc.text(value, pageW - margin, y, { align: 'right' });
      });

      const dividerY = 48;
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.4);
      doc.line(margin, dividerY, pageW - margin, dividerY);

      const billY = dividerY + 8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
      doc.text('BILL TO', margin, billY);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
      doc.text(clientName || 'Client', margin, billY + 6);

      let currentBillY = billY + 11;
      if (clientAddress) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
        doc.text(clientAddress, margin, currentBillY);
        currentBillY += 5;
      }
      if (clientEmail) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
        doc.text(clientEmail, margin, currentBillY);
      }

      const tableStartY = billY + 28;
      autoTable(doc, {
        startY: tableStartY,
        margin: { left: margin, right: margin },
        head: [['#', 'Product', 'SKU', 'Date', 'Type', 'Qty', 'Unit Price', 'Total']],
        body: selectedTx.map((t, i) => [
          String(i + 1), t.productName, t.productSku || '-',
          new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          t.type === 'Out' ? 'Sale' : 'Stock In',
          t.qtyChange, fmt(t.unitPrice), fmt(t.total),
        ]),
        headStyles: { fillColor: [248, 250, 252], textColor: [100, 100, 100], fontStyle: 'bold', fontSize: 8, halign: 'center' },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [40, 40, 40], fontSize: 8.5, lineColor: [240, 240, 240], lineWidth: 0.1, halign: 'center' },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        columnStyles: {
          0: { cellWidth: 10, textColor: [120, 120, 120] },
          1: { cellWidth: 'auto', fontStyle: 'bold', textColor: [0, 0, 0] },
          2: { cellWidth: 16 }, 
          3: { cellWidth: 20 }, 
          4: { cellWidth: 14 },
          5: { cellWidth: 12 }, 
          6: { cellWidth: 26 },
          7: { cellWidth: 30, fontStyle: 'bold', textColor: [0, 0, 0] },
        },
        styles: { overflow: 'linebreak', cellPadding: { top: 5, right: 2, bottom: 5, left: 2 } },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 8;
      const totalsX = pageW - margin - 65;
      const drawTotalRow = (label: string, value: string, y: number, bold = false, highlight = false) => {
        if (highlight) { doc.setFillColor(0, 0, 0); doc.roundedRect(totalsX - 2, y - 5, 65 + 2, 9, 1.5, 1.5, 'F'); }
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 9 : 8);
        doc.setTextColor(highlight ? 255 : bold ? 0 : 80);
        doc.text(label, totalsX + 2, y); doc.text(value, pageW - margin, y, { align: 'right' });
      };

      let ty = finalY;
      drawTotalRow('Subtotal', fmt(subtotal), ty);
      if (Number(taxRate) > 0) {
        ty += 7; drawTotalRow(`Tax (${taxRate}%)`, fmt(tax), ty);
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(totalsX, ty + 3, pageW - margin, ty + 3); ty += 8;
        drawTotalRow('TOTAL DUE', fmt(grandTotal), ty + 2, true, true);
      } else {
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(totalsX, ty + 3, pageW - margin, ty + 3); ty += 8;
        drawTotalRow('TOTAL DUE', fmt(grandTotal), ty + 2, true, true);
      }

      if (notes) {
        const notesY = Math.max(ty + 20, finalY + 40);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(100, 100, 100); doc.text('NOTES', margin, notesY);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
        doc.text(notes, margin, notesY + 5, { maxWidth: contentW * 0.55 });
      }

      doc.setFillColor(245, 245, 245); doc.rect(0, pageH - 14, pageW, 14, 'F');
      doc.setFontSize(7); doc.setTextColor(100, 100, 100);
      doc.text(companyName, margin, pageH - 5.5);
      doc.text(`Generated ${new Date().toLocaleString()}`, pageW - margin, pageH - 5.5, { align: 'right' });

      doc.save(`${invoiceNo}.pdf`);
    } catch (err) { alert('Failed to generate PDF.'); } finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-10 mx-4 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/60 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-black" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Generate Invoice PDF</h3>
              <p className="text-xs text-zinc-500">{selectedTx.length} items selected for invoice</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Side: Transaction Selection */}
          <div className="w-1/2 border-r border-zinc-800 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/30 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Select Transactions</p>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition-colors uppercase font-bold">Select All</button>
                  <button onClick={deselectAll} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition-colors uppercase font-bold">Deselect All</button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputClass} !py-1.5`} placeholder="From" title="From Date" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputClass} !py-1.5`} placeholder="To" title="To Date" />
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={includeExpenses} onChange={(e) => setIncludeExpenses(e.target.checked)} className="w-3.5 h-3.5 rounded bg-zinc-900 border-zinc-700" />
                <span className="text-xs text-zinc-400">Include Expenses (Stock In)</span>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/50">
              {filteredTx.length === 0 ? (
                <div className="p-10 text-center text-zinc-600 text-sm italic">No transactions match filters</div>
              ) : (
                filteredTx.map((t) => (
                  <div 
                    key={t.id} 
                    onClick={() => toggleSelect(t.id)}
                    className={`p-3 flex items-start gap-3 cursor-pointer transition-colors hover:bg-zinc-900/50 ${selectedIds.has(t.id) ? 'bg-zinc-900/30' : ''}`}
                  >
                    <div className="mt-1">
                      {selectedIds.has(t.id) ? (
                        <CheckSquare className="w-4 h-4 text-white" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm font-bold text-white truncate">{t.productName}</p>
                        <p className="text-sm font-bold text-white tabular-nums shrink-0">{fmt(t.total)}</p>
                      </div>
                      <div className="flex justify-between text-[11px] text-zinc-500 mt-0.5">
                        <p>{new Date(t.date).toLocaleDateString()}</p>
                        <p>{t.qtyChange} units &bull; {fmt(t.unitPrice)}</p>
                      </div>
                      {t.buyerName && <p className="text-[10px] text-zinc-400 mt-1 italic truncate">Buyer: {t.buyerName}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Side: Invoice Configuration */}
          <div className="w-1/2 flex flex-col overflow-hidden bg-zinc-900/10">
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Invoice Meta */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Invoice Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Invoice No.</label>
                    <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Tax Rate (%)</label>
                    <input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Issue Date</label>
                    <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Due Date</label>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Company Info */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Your Business</p>
                <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} placeholder="Company Name" />
                <input type="text" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} className={inputClass} placeholder="Address" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} className={inputClass} placeholder="Email" />
                  <input type="text" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} className={inputClass} placeholder="Phone" />
                </div>
              </div>

              {/* Client Info */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Client (Bill To)</p>
                <input required type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputClass} placeholder="Client Name (Required)" />
                <input type="text" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className={inputClass} placeholder="Client Address (Optional)" />
                <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={inputClass} placeholder="Client Email (Optional)" />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1 uppercase font-bold">Notes / Terms</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
              </div>
            </div>

            {/* Footer Summary */}
            <div className="p-5 border-t border-zinc-800 bg-zinc-900/40">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs">
                  <p className="text-zinc-500 uppercase font-bold tracking-widest">Subtotal</p>
                  <p className="text-zinc-400 font-medium">{fmt(subtotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Total Due</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{fmt(grandTotal)}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white py-2.5 rounded-lg font-bold transition-colors border border-zinc-800 text-sm">Cancel</button>
                <button 
                  onClick={handleGenerate} 
                  disabled={generating || selectedTx.length === 0 || !clientName} 
                  className="flex-1 bg-white hover:bg-zinc-200 disabled:opacity-50 text-black py-2.5 rounded-lg font-bold transition-colors shadow-lg flex items-center justify-center gap-2 text-sm"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export PDF {selectedTx.length > 0 && `(${selectedTx.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
