import { describe, it, expect } from 'vitest';
import { uomToBase, uomFactor, resolvePrice, type ProductUom, type PriceRow } from './uom-pricing';

const uoms: ProductUom[] = [
  { uom: 'piece', factor: 1 },
  { uom: 'box', factor: 6 },
  { uom: 'carton', factor: 12, isCase: true },
];

describe('uom-pricing · conversion', () => {
  it('converts a uom qty to base units', () => {
    expect(uomToBase(2, 'carton', uoms)).toBe(24);
    expect(uomToBase(3, 'box', uoms)).toBe(18);
    expect(uomToBase(5, 'piece', uoms)).toBe(5);
  });
  it('unknown uom ⇒ factor 1 (never crashes)', () => {
    expect(uomToBase(4, 'pallet', uoms)).toBe(4);
    expect(uomFactor('pallet', uoms)).toBe(1);
  });
});

describe('uom-pricing · resolvePrice precedence + fallback', () => {
  const base: Omit<PriceRow, 'price' | 'minQty'> = {
    uom: 'carton', channelId: null, customerId: null, effectiveFrom: '2026-01-01', effectiveTo: null, isActive: true,
  };
  const rows: PriceRow[] = [
    { ...base, minQty: 1, price: 100 },                          // generic carton
    { ...base, minQty: 10, price: 90 },                          // qty tier ≥10
    { ...base, channelId: 'modern', minQty: 1, price: 95 },      // channel-specific
    { ...base, customerId: 'C1', minQty: 1, price: 80 },         // customer-specific
  ];

  it('customer-specific wins over channel/generic', () => {
    expect(resolvePrice(rows, { uom: 'carton', qty: 1, customerId: 'C1', channelId: 'modern' }, 14.3, uoms)).toBe(80);
  });
  it('channel-specific wins over generic when no customer match', () => {
    expect(resolvePrice(rows, { uom: 'carton', qty: 1, customerId: 'CX', channelId: 'modern' }, 14.3, uoms)).toBe(95);
  });
  it('highest qualifying min_qty tier applies', () => {
    expect(resolvePrice(rows, { uom: 'carton', qty: 12, customerId: null, channelId: null }, 14.3, uoms)).toBe(90);
    expect(resolvePrice(rows, { uom: 'carton', qty: 5, customerId: null, channelId: null }, 14.3, uoms)).toBe(100);
  });
  it('inactive / out-of-window rows are ignored', () => {
    const r: PriceRow[] = [{ ...base, minQty: 1, price: 100, isActive: false }];
    expect(resolvePrice(r, { uom: 'carton', qty: 1 }, 14.3, uoms)).toBe(14.3 * 12); // fallback
    const future: PriceRow[] = [{ ...base, minQty: 1, price: 100, effectiveFrom: '2099-01-01' }];
    expect(resolvePrice(future, { uom: 'carton', qty: 1, date: '2026-06-01' }, 14.3, uoms)).toBe(14.3 * 12);
  });
  it('fallback to sell_price × factor when no price row matches', () => {
    expect(resolvePrice([], { uom: 'carton', qty: 1 }, 14.3, uoms)).toBe(14.3 * 12);
    expect(resolvePrice([], { uom: 'piece', qty: 1 }, 14.3, uoms)).toBe(14.3);
  });
});
