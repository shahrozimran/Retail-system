import { formatMoney } from './money.ts';

export type InvoiceTransaction = {
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

export type InvoiceDraft = {
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  notes: string;
  taxRate: number;
  transactions: InvoiceTransaction[];
  accountBalance?: number;
};

export const invoiceMoney = formatMoney;

export function invoiceDate(value: string) {
  if (!value) return 'Not specified';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Invalid date';
}

export function invoiceTotals(transactions: InvoiceTransaction[], rate: number) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || Math.abs(rate * 100 - Math.round(rate * 100)) > 0.000001) {
    throw new Error('Enter a tax rate between 0 and 100, with up to two decimal places.');
  }
  let subtotalMinor = BigInt(0);
  for (const item of transactions) {
    if (![item.qtyChange, item.unitPrice, item.total].every(Number.isFinite) || item.qtyChange <= 0 || item.unitPrice < 0 || item.total < 0) {
      throw new Error('An invoice item has an invalid quantity or amount.');
    }
    const minor = Math.round((item.total + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(minor)) throw new Error('An invoice amount is too large.');
    subtotalMinor += BigInt(minor);
  }
  // Compute tax in integer minor units, including exact half-cent rounding.
  const taxMinor = (subtotalMinor * BigInt(Math.round(rate * 100)) + BigInt(5000)) / BigInt(10000);
  const totalMinor = subtotalMinor + taxMinor;
  if (totalMinor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The invoice total is too large.');
  return { subtotal: Number(subtotalMinor) / 100, tax: Number(taxMinor) / 100, total: Number(totalMinor) / 100 };
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function invoiceDueDate(issueDate: string, days: number) {
  if (!validDate(issueDate) || !Number.isInteger(days) || days < 0 || days > 365) return '';
  const date = new Date(`${issueDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function invoiceError(draft: InvoiceDraft): string {
  if (!draft.transactions.length) return 'Select at least one transaction for this invoice.';
  if (!draft.invoiceNo.trim()) return 'Add an invoice number.';
  if (draft.invoiceNo.length > 80) return 'Keep the invoice number within 80 characters.';
  if (!draft.companyName.trim()) return 'Add your business name.';
  if (!draft.clientName.trim()) return 'Add a customer name.';
  if (!validDate(draft.issueDate)) return 'Choose a valid issue date.';
  if (draft.dueDate && (!validDate(draft.dueDate) || draft.dueDate < draft.issueDate)) return 'The due date must be on or after the issue date.';
  for (const value of [draft.companyName, draft.clientName]) if (value.length > 160) return 'Keep business and customer names within 160 characters.';
  for (const value of [draft.companyAddress, draft.clientAddress]) if (value.length > 600) return 'Keep each address within 600 characters.';
  for (const value of [draft.companyEmail, draft.clientEmail]) if (value.length > 254) return 'Keep email addresses within 254 characters.';
  if (draft.companyPhone.length > 60) return 'Keep the phone number within 60 characters.';
  if (draft.notes.length > 4000) return 'Keep notes within 4,000 characters.';
  if (draft.transactions.some(item => !item.productName.trim() || item.productName.length > 300 || item.productSku.length > 100 || invoiceDate(item.date) === 'Invalid date')) return 'An invoice item has invalid product details or a date.';
  if (draft.accountBalance !== undefined && !Number.isFinite(draft.accountBalance)) return 'The account balance is invalid.';
  try { invoiceTotals(draft.transactions, draft.taxRate); } catch (error) { return error instanceof Error ? error.message : 'Check the invoice amounts.'; }
  return '';
}
