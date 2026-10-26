import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoicePdf } from '../src/lib/invoice-pdf.ts';
import { invoiceDueDate, invoiceError, invoiceTotals } from '../src/lib/invoice.ts';

const item = { id: 'line-1', date: '2026-10-26T10:00:00Z', productName: 'Headlight', productSku: '001', type: 'Out', qtyChange: 50, unitPrice: 200, total: 10000, buyerName: 'Sample customer', description: '', batchId: 'batch-1' };
const draft = { invoiceNo: 'INV-969405', issueDate: '2026-10-26', dueDate: '2026-10-29', companyName: 'Global Auto Parts', companyAddress: 'Lahore, Pakistan', companyEmail: 'billing@example.invalid', companyPhone: '0300 0000000', clientName: 'Sample customer', clientAddress: '', clientEmail: '', notes: 'Thank you for your business!', taxRate: 5, transactions: [item] };

test('invoice totals use currency precision and keep account balances separate', () => {
  assert.deepEqual(invoiceTotals([item], 5), { subtotal: 10000, tax: 500, total: 10500 });
  assert.deepEqual(invoiceTotals([{ ...item, total: 0.1 }, { ...item, total: 0.2 }], 5), { subtotal: 0.3, tax: 0.02, total: 0.32 });
  assert.equal(invoiceTotals([{ ...item, total: 1.005 }], 0).total, 1.01);
  assert.equal(invoiceError({ ...draft, accountBalance: -20000 }), '');
  assert.equal(invoiceTotals(draft.transactions, draft.taxRate).total, 10500);
});

test('invoice validation prevents invalid tax, dates, empty invoices and invalid amounts', () => {
  for (const taxRate of [-1, 101, NaN, 5.123]) assert.ok(invoiceError({ ...draft, taxRate }));
  assert.ok(invoiceError({ ...draft, dueDate: '2026-10-25' }));
  assert.ok(invoiceError({ ...draft, issueDate: '2026-02-31' }));
  assert.ok(invoiceError({ ...draft, transactions: [] }));
  assert.ok(invoiceError({ ...draft, transactions: [{ ...item, total: Infinity }] }));
  assert.equal(invoiceError({ ...draft, transactions: [{ ...item, total: 0, unitPrice: 0 }] }), '');
});

test('due date shortcuts handle month and year boundaries', () => {
  assert.equal(invoiceDueDate('2026-10-26', 7), '2026-11-02');
  assert.equal(invoiceDueDate('2026-12-28', 7), '2027-01-04');
  assert.equal(invoiceDueDate('2028-02-28', 1), '2028-02-29');
  assert.equal(invoiceDueDate('2026-02-31', 7), '');
});

test('normal invoice stays on one page and long tables and notes paginate', () => {
  const normal = createInvoicePdf(draft);
  assert.equal(normal.getNumberOfPages(), 1);
  assert.ok(normal.output().includes('10,500.00'));
  assert.equal(createInvoicePdf({ ...draft, accountBalance: 40999.75, transactions: Array.from({ length: 4 }, (_, i) => ({ ...item, id: `line-${i}` })) }).getNumberOfPages(), 1);
  const long = createInvoicePdf({ ...draft,
    invoiceNo: 'INV-CUSTOMER-REFERENCE-2026-10-26-EXTENDED-IDENTIFIER',
    companyName: 'Global Auto Parts Manufacturing and Distribution Services for Commercial Vehicles',
    companyAddress: 'Building 18, Industrial Avenue, Business District, Lahore, Punjab, Pakistan. '.repeat(4),
    clientName: 'Commercial vehicle maintenance and replacement parts procurement department',
    clientAddress: 'Unit 456, Service and Logistics Centre, Main Industrial Road, Lahore, Pakistan. '.repeat(3),
    accountBalance: -123456789.99,
    notes: 'Payment instructions and warranty terms are printed here for reference. '.repeat(50),
    transactions: Array.from({ length: 70 }, (_, i) => ({ ...item, id: `line-${i}`, productName: `Assembly ${i + 1}: premium heavy-duty headlight with adjustable bracket and complete installation components` })),
  });
  assert.ok(long.getNumberOfPages() >= 4);
  assert.ok(long.output().includes('Assembly 70'));
  assert.ok(long.output().includes('REFERENCE ONLY'));
  assert.ok(long.output().includes('Page 1 of'));
});
