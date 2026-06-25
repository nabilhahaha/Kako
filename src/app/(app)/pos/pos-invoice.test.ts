import { describe, it, expect } from 'vitest';
import { buildPosInvoice } from './pos-invoice';
import type { CartLine, CartCharges } from './pos-cart';

describe('pos-invoice — ZATCA-ready payload builder', () => {
  const lines: CartLine[] = [
    { productId: 'a', name: 'Burger', price: 50, taxRate: 0, qty: 2 },
    { productId: 'b', name: 'Cola', price: 10, taxRate: 0, qty: 1 },
  ];
  const charges: CartCharges = { discountType: 'amount', discountValue: 0, serviceRate: 0, taxRate: 15, deliveryFee: 0 };

  it('payload carries seller/customer/lines/totals and matches cart math', () => {
    const { payload, qr } = buildPosInvoice({
      lines, charges, orderType: 'takeaway', issueAt: '2026-06-25T13:30:00Z',
      seller: { name: 'Tasty Bites', vat: '300000000000003', branch: 'Main' },
      customer: { name: 'Walk-in' }, paymentMethod: 'cash',
    });
    expect(payload.type).toBe('simplified_tax_invoice');
    expect(payload.docType).toBe('invoice');
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines[0]).toMatchObject({ name: 'Burger', qty: 2, unitPrice: 50, total: 100 });
    expect(payload.totals.subtotal).toBe(110);
    expect(payload.totals.tax).toBe(16.5);     // 15% of 110
    expect(payload.totals.grandTotal).toBe(126.5);
    expect(payload.seller.vat).toBe('300000000000003');
    expect(payload.payment.method).toBe('cash');
    expect(typeof qr).toBe('string');
    expect(qr.length).toBeGreaterThan(20);
  });

  it('supports credit_note doc type for reversals', () => {
    const { payload } = buildPosInvoice({
      lines, charges, orderType: 'takeaway', issueAt: '2026-06-25T13:30:00Z',
      seller: { name: 'X', vat: null, branch: null }, paymentMethod: 'cash', docType: 'credit_note',
    });
    expect(payload.docType).toBe('credit_note');
  });
});
