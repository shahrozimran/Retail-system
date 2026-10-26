import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { invoiceDate, invoiceError, invoiceMoney, invoiceTotals, type InvoiceDraft } from './invoice.ts';

const INK = '#1c303d';
const TEAL = '#087e78';
const MUTED = '#5a6b78';
const LINE = '#dfe7eb';
const SOFT = '#f1f7f6';
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\r\n/g, '\n');

export function createInvoicePdf(draft: InvoiceDraft) {
  const error = invoiceError(draft);
  if (error) throw new Error(error);
  const totals = invoiceTotals(draft.transactions, draft.taxRate);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title: `Invoice ${draft.invoiceNo}`, subject: `Invoice for ${draft.clientName}`, author: draft.companyName, creator: 'Global Auto Parts' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 17;
  const contentWidth = width - margin * 2;
  const bottom = height - 23;
  const lineHeight = (size: number) => size / 2.83465 * 1.3;

  function lines(value: string, size: number, maxWidth: number, bold = false): string[] {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    return doc.splitTextToSize(clean(value), maxWidth) as string[];
  }

  function text(value: string, x: number, y: number, maxWidth: number, size = 9, bold = false, color = INK, right = false) {
    const wrapped = lines(value, size, maxWidth, bold);
    doc.setTextColor(color);
    doc.text(wrapped, right ? x + maxWidth : x, y, { baseline: 'top', lineHeightFactor: 1.3, align: right ? 'right' : 'left' });
    return y + wrapped.length * lineHeight(size);
  }

  const continuationPages = new Set<number>();
  function continuationHeader() {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (page === 1 || continuationPages.has(page)) return;
    continuationPages.add(page);
    const title = lines(draft.companyName, 10, 105, true)[0];
    text(title, margin, 13, 105, 10, true);
    text('INVOICE / CONTINUED', width - margin - 58, 13, 58, 8, true, TEAL, true);
    doc.setDrawColor(LINE); doc.setLineWidth(0.3); doc.line(margin, 24, width - margin, 24);
  }

  function space(y: number, required: number) {
    if (y + required <= bottom) return y;
    doc.addPage(); continuationHeader(); return 32;
  }

  let companyY = text(draft.companyName, margin, 19, 110, 20, true);
  companyY += 4;
  for (const value of [draft.companyAddress, draft.companyEmail, draft.companyPhone].filter(Boolean)) {
    companyY = text(value, margin, companyY, 110, 8.5, false, MUTED) + 1.3;
  }
  text('INVOICE', width - margin - 53, 19, 53, 25, true, TEAL, true);
  text('SALES & BUSINESS ACTIVITY', width - margin - 62, 33, 62, 7.2, false, MUTED, true);

  // Metadata uses separate label and value rows in independent columns.
  // Neither a long invoice number nor a long date can enter another column.
  let y = Math.max(companyY + 8, 50);
  const columns = [
    ['INVOICE NUMBER', draft.invoiceNo],
    ['ISSUED ON', invoiceDate(draft.issueDate)],
    ['DUE DATE', invoiceDate(draft.dueDate)],
  ];
  const columnWidth = contentWidth / 3;
  const metaHeight = Math.max(...columns.map(([, value]) => lines(value, 9.5, columnWidth - 10, true).length)) * lineHeight(9.5) + 17;
  y = space(y, metaHeight + 8);
  doc.setFillColor(SOFT); doc.roundedRect(margin, y, contentWidth, metaHeight, 2, 2, 'F');
  columns.forEach(([label, value], index) => {
    const x = margin + index * columnWidth + 5;
    text(label, x, y + 4, columnWidth - 10, 7, true, MUTED);
    text(value, x, y + 10, columnWidth - 10, 9.5, true);
  });
  y += metaHeight + 10;

  const clientHeight = 8 + lines(draft.clientName, 11.5, 102, true).length * lineHeight(11.5)
    + [draft.clientAddress, draft.clientEmail].filter(Boolean).reduce((sum, value) => sum + lines(value, 8.5, 102).length * lineHeight(8.5) + 1.3, 0);
  y = space(y, Math.max(clientHeight, 26) + 10);
  text('BILL TO', margin, y, 102, 7.2, true, MUTED);
  let clientY = text(draft.clientName, margin, y + 6, 102, 11.5, true) + 2;
  for (const value of [draft.clientAddress, draft.clientEmail].filter(Boolean)) clientY = text(value, margin, clientY, 102, 8.5, false, MUTED) + 1.3;
  text('AMOUNT DUE', width - margin - 64, y, 64, 7.2, true, MUTED, true);
  const amount = invoiceMoney(totals.total);
  let amountSize = 19;
  doc.setFont('helvetica', 'bold');
  while (amountSize > 10) { doc.setFontSize(amountSize); if (doc.getTextWidth(amount) <= 64) break; amountSize--; }
  const amountY = text(amount, width - margin - 64, y + 6, 64, amountSize, true, TEAL, true);
  y = space(Math.max(clientY, amountY) + 10, 31);

  type Description = { title: string[]; details: string[]; height: number };
  const descriptions = new Map<number, Description>();
  const descriptionWidth = 82;
  autoTable(doc, {
    startY: y, margin: { left: margin, right: margin, top: 32, bottom: 23 },
    tableWidth: contentWidth, theme: 'plain', showHead: 'everyPage', rowPageBreak: 'avoid',
    head: [['#', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
    body: draft.transactions.map((item, index) => [String(index + 1), item.productName, String(item.qtyChange), invoiceMoney(item.unitPrice), invoiceMoney(item.total)]),
    styles: { font: 'helvetica', fontSize: 8.5, overflow: 'linebreak', cellPadding: { top: 4, bottom: 4, left: 3, right: 3 }, valign: 'middle', textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.15 } },
    headStyles: { fillColor: '#1b4146', textColor: '#ffffff', fontSize: 7.4, fontStyle: 'bold', cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 } },
    alternateRowStyles: { fillColor: '#f7f9fb' },
    columnStyles: {
      0: { cellWidth: 10, textColor: MUTED, fontSize: 7.5 },
      1: { cellWidth: 88 },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: contentWidth - 142, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell(data) {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const item = draft.transactions[data.row.index];
      const title = lines(item.productName, 9, descriptionWidth, true);
      const details = lines(`SKU: ${item.productSku || '-'} / ${invoiceDate(item.date)} / ${item.type === 'Out' ? 'Sale' : 'Stock in'}`, 7.2, descriptionWidth);
      const required = title.length * lineHeight(9) + 1.5 + details.length * lineHeight(7.2);
      descriptions.set(data.row.index, { title, details, height: required });
      data.cell.text = [];
      data.cell.styles.minCellHeight = required + 8;
    },
    didDrawCell(data) {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const description = descriptions.get(data.row.index)!;
      const x = data.cell.x + 3, top = data.cell.y + (data.cell.height - description.height) / 2;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(INK);
      doc.text(description.title, x, top, { baseline: 'top', lineHeightFactor: 1.3 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(MUTED);
      doc.text(description.details, x, top + description.title.length * lineHeight(9) + 1.5, { baseline: 'top', lineHeightFactor: 1.3 });
    },
    willDrawPage: continuationHeader,
  });

  const tableEnd = () => (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const summary = [['Subtotal', invoiceMoney(totals.subtotal)]];
  if (draft.taxRate > 0) summary.push([`Tax (${draft.taxRate}%)`, invoiceMoney(totals.tax)]);
  summary.push(['Total due', invoiceMoney(totals.total)]);
  autoTable(doc, {
    startY: tableEnd() + 8, margin: { left: width - margin - 83, right: margin, top: 32, bottom: 23 },
    tableWidth: 83, theme: 'plain', pageBreak: 'avoid', rowPageBreak: 'avoid', showHead: 'never', body: summary,
    styles: { font: 'helvetica', fontSize: 9, textColor: MUTED, overflow: 'linebreak', cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 48, halign: 'right', fontStyle: 'bold', textColor: INK } },
    didParseCell(data) {
      if (data.row.index === summary.length - 1) Object.assign(data.cell.styles, { fillColor: TEAL, textColor: '#ffffff', fontSize: 10.5, fontStyle: 'bold', cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } });
    },
    willDrawPage: continuationHeader,
  });
  const summaryTable = (doc as jsPDF & { lastAutoTable: { finalY: number; body: { cells: { [key: string]: { y: number } } }[] } }).lastAutoTable;
  const summaryTop = summaryTable.body[0].cells[0].y;
  const noteWidth = contentWidth - 83 - 10;
  const shortNotes = draft.notes.trim() && lines(draft.notes, 8.5, noteWidth).length * lineHeight(8.5) + 9 <= summaryTable.finalY - summaryTop;
  if (shortNotes) {
    text('NOTES & PAYMENT TERMS', margin, summaryTop + 1, noteWidth, 7.2, true, MUTED);
    text(draft.notes, margin, summaryTop + 8, noteWidth, 8.5, false, MUTED);
  }
  y = tableEnd() + 12;

  if (draft.accountBalance !== undefined) {
    const balance = `${draft.accountBalance >= 0 ? 'Receivable' : 'Payable'}: ${invoiceMoney(Math.abs(draft.accountBalance))}`;
    const balanceHeight = lines(balance, 9, contentWidth - 10, true).length * lineHeight(9);
    const boxHeight = 23 + balanceHeight;
    y = space(y, boxHeight);
    doc.setFillColor(SOFT); doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'F');
    text('ACCOUNT BALANCE / REFERENCE ONLY', margin + 5, y + 4, contentWidth - 10, 7, true, MUTED);
    text(balance, margin + 5, y + 10, contentWidth - 10, 9, true);
    text('Shown separately. Not added to this invoice total.', margin + 5, y + 14 + balanceHeight, contentWidth - 10, 8, false, MUTED);
    y += boxHeight + 9;
  }

  if (draft.notes.trim() && !shortNotes) {
    y = space(y, 17);
    text('NOTES & PAYMENT TERMS', margin, y, contentWidth, 7.2, true, MUTED); y += 7;
    const noteLines = lines(draft.notes, 8.5, contentWidth);
    for (const line of noteLines) {
      if (y + lineHeight(8.5) > bottom) {
        doc.addPage(); continuationHeader(); y = 32;
        text('NOTES & PAYMENT TERMS / CONTINUED', margin, y, contentWidth, 7.2, true, MUTED); y += 7;
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(MUTED);
      doc.text(line, margin, y, { baseline: 'top' }); y += lineHeight(8.5);
    }
  }

  // Add page numbers only after all table, totals and notes pagination is done.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFillColor(TEAL); doc.rect(0, 0, width, 2, 'F');
    doc.setDrawColor(LINE); doc.setLineWidth(0.25); doc.line(margin, height - 17, width - margin, height - 17);
    text(lines(draft.companyName, 7, 130)[0], margin, height - 12, 130, 7, false, MUTED);
    text(`Page ${page} of ${pages}`, width - margin - 28, height - 12, 28, 7, false, MUTED, true);
  }
  return doc;
}
