import { describe, it, expect } from 'vitest';
import { toReceiptModel, receiptTextLines } from './receipt-model';
import { receiptUrl } from './devices/browser-providers';
import type { PosInvoiceView } from './pos-actions';

const inv: PosInvoiceView = {
  id: 'i1', invoiceNumber: 'INV-2026-000123', invoiceType: 'simplified_tax_invoice', docType: 'invoice', status: 'issued',
  issueAt: '2026-06-25T13:30:00Z', sellerName: 'Tasty Bites', sellerVat: '300000000000003',
  customerName: 'Walk-in', orderType: 'takeaway', paymentMethod: 'cash', cashierName: 'Sam',
  subtotal: 110, discountTotal: 0, serviceTotal: 0, taxTotal: 16.5, grandTotal: 126.5,
  zatcaQr: 'BASE64QR==', zatcaStatus: 'not_reported',
  lines: [{ name: 'Burger', qty: 2, unitPrice: 50, total: 100, note: 'no onions' }, { name: 'Cola', qty: 1, unitPrice: 10, total: 10 }],
};

describe('pos receipt model + device url', () => {
  it('toReceiptModel maps invoice data (simplified tax invoice)', () => {
    const m = toReceiptModel(inv);
    expect(m.isCredit).toBe(false);
    expect(m.typeLabel.en).toBe('Simplified Tax Invoice');
    expect(m.seller).toEqual({ name: 'Tasty Bites', vat: '300000000000003' });
    expect(m.totals.grand).toBe(126.5);
    expect(m.qr).toBe('BASE64QR==');
    expect(m.lines).toHaveLength(2);
  });

  it('credit note flips the type label', () => {
    const m = toReceiptModel({ ...inv, docType: 'credit_note' });
    expect(m.isCredit).toBe(true);
    expect(m.typeLabel.en).toBe('Credit Note');
  });

  it('receiptTextLines renders a thermal-style 40-col receipt from the model', () => {
    const lines = receiptTextLines(toReceiptModel(inv), 40);
    const joined = lines.join('\n');
    expect(lines.every((l) => l.length <= 40)).toBe(true);
    expect(joined).toContain('INV-2026-000123');
    expect(joined).toContain('TOTAL');
    expect(joined).toContain('126.50');
  });

  it('receiptUrl prefers the POS invoice, falls back to the order', () => {
    expect(receiptUrl({ kind: 'receipt', invoiceId: 'i1' })).toBe('/print/pos/i1?autoprint=1');
    expect(receiptUrl({ kind: 'receipt', invoiceId: '', orderId: 'o1' })).toBe('/print/restaurant/order/o1?autoprint=1');
  });
});
