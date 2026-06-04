import { describe, it, expect } from 'vitest';
import { toPriceRows, previewResolvedPrice, type RawPriceRow } from './price-book-preview';

const rows: RawPriceRow[] = [
  { product_id: 'P1', uom: 'carton', channel_id: null, customer_id: null, min_qty: 1, price: 100, effective_from: '2026-01-01', effective_to: null, is_active: true },
  { product_id: 'P1', uom: 'carton', channel_id: null, customer_id: null, min_qty: 10, price: 90, effective_from: '2026-01-01', effective_to: null, is_active: true },
  { product_id: 'P1', uom: 'carton', channel_id: null, customer_id: 'C1', min_qty: 1, price: 80, effective_from: '2026-01-01', effective_to: null, is_active: true },
  { product_id: 'P2', uom: 'piece', channel_id: null, customer_id: null, min_qty: 1, price: 5, effective_from: '2026-01-01', effective_to: null, is_active: true },
];

describe('price-book-preview · toPriceRows', () => {
  it('maps only the requested product and renames snake→camel fields', () => {
    const mapped = toPriceRows(rows, 'P1');
    expect(mapped).toHaveLength(3);
    expect(mapped[0]).toMatchObject({ uom: 'carton', minQty: 1, price: 100, isActive: true, effectiveFrom: '2026-01-01' });
    expect(toPriceRows(rows, 'P2')).toHaveLength(1);
  });
});

describe('price-book-preview · previewResolvedPrice', () => {
  it('picks the generic price for a single carton', () => {
    expect(previewResolvedPrice(rows, 'P1', 'carton', 1)).toBe(100);
  });

  it('applies the highest qualifying qty tier', () => {
    expect(previewResolvedPrice(rows, 'P1', 'carton', 12)).toBe(90);
  });

  it('customer-specific price wins when the customer matches', () => {
    expect(previewResolvedPrice(rows, 'P1', 'carton', 1, { customerId: 'C1' })).toBe(80);
  });

  it('falls back to the supplied fallback when no row matches', () => {
    expect(previewResolvedPrice(rows, 'P1', 'pallet', 1, { fallback: 42 })).toBe(42);
    expect(previewResolvedPrice([], 'P1', 'carton', 1)).toBe(0);
  });
});
