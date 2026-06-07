import { describe, it, expect } from 'vitest';
import { matchLine } from './three-way-match';

const base = { orderedQty: 100, poUnitPrice: 10, receivedQty: 100, invoicedQty: 100, invoiceUnitPrice: 10 };

describe('3-way match engine', () => {
  it('matches cleanly when PO = GRN = Invoice', () => {
    const r = matchLine(base);
    expect(r.matched).toBe(true);
    expect(r.flags).toEqual([]);
    expect(r).toMatchObject({ qtyVariance: 0, priceVariance: 0, overReceivedQty: 0 });
  });

  it('BLOCKS over-billing (invoiced > received) — never pay for unreceived goods', () => {
    const r = matchLine({ ...base, receivedQty: 90, invoicedQty: 100 });
    expect(r.matched).toBe(false);
    expect(r.flags).toContain('over_billed');
    expect(r.qtyVariance).toBe(10);
  });

  it('allows under-billing (invoiced < received) as an advisory partial invoice', () => {
    const r = matchLine({ ...base, receivedQty: 100, invoicedQty: 60 });
    expect(r.matched).toBe(true);
    expect(r.flags).toEqual(['under_billed']);
    expect(r.qtyVariance).toBe(-40);
  });

  it('BLOCKS a price above the PO beyond tolerance', () => {
    const r = matchLine({ ...base, invoiceUnitPrice: 12 });
    expect(r.matched).toBe(false);
    expect(r.flags).toContain('price_variance');
    expect(r.priceVariance).toBe(2);
  });

  it('allows a price variance within an absolute tolerance', () => {
    const r = matchLine({ ...base, invoiceUnitPrice: 10.5 }, { priceAbs: 1 });
    expect(r.matched).toBe(true);
    expect(r.flags).not.toContain('price_variance');
  });

  it('allows a price variance within a percentage tolerance', () => {
    const r = matchLine({ ...base, invoiceUnitPrice: 10.4 }, { pricePct: 5 }); // 5% of 10 = 0.5
    expect(r.matched).toBe(true);
    expect(r.flags).not.toContain('price_variance');
  });

  it('allows small over-billing within a qty tolerance', () => {
    const r = matchLine({ ...base, receivedQty: 100, invoicedQty: 101 }, { qtyAbs: 2 });
    expect(r.matched).toBe(true);
    expect(r.flags).not.toContain('over_billed');
  });

  it('flags over-receipt (received > ordered) as advisory without blocking payment', () => {
    const r = matchLine({ ...base, orderedQty: 100, receivedQty: 110, invoicedQty: 110 });
    expect(r.matched).toBe(true);            // billed == received, price ok
    expect(r.flags).toEqual(['over_received']);
    expect(r.overReceivedQty).toBe(10);
  });

  it('accumulates multiple blocking flags', () => {
    const r = matchLine({ ...base, receivedQty: 90, invoicedQty: 100, invoiceUnitPrice: 13 });
    expect(r.matched).toBe(false);
    expect(r.flags).toEqual(expect.arrayContaining(['over_billed', 'price_variance']));
  });

  it('blocks a price BELOW the PO beyond tolerance too (variance is bidirectional)', () => {
    const r = matchLine({ ...base, invoiceUnitPrice: 7 });
    expect(r.flags).toContain('price_variance');
    expect(r.priceVariance).toBe(-3);
  });
});
