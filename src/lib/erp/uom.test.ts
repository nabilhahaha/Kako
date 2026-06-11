import { describe, it, expect } from 'vitest';
import {
  resolveUnits, factorOf, toBase, fromBase, convertUnits, priceToBase, priceFromBase, unitLabel,
} from './uom';

// Pharmacy: box → strip → tablet (base). 1 strip = 10 tablets, 1 box = 30 tablets.
const pharmacy = resolveUnits({
  base_uom: 'tablet',
  purchase_uom: 'box',
  default_sell_uom: 'strip',
  uoms: [
    { uom: 'strip', factor: 10 },
    { uom: 'box', factor: 30, is_case: true },
  ],
});

// FMCG: carton → pack → piece (base). 1 pack = 6 pieces, 1 carton = 24 pieces.
const fmcg = resolveUnits({
  base_uom: 'piece',
  uoms: [{ uom: 'pack', factor: 6 }, { uom: 'carton', factor: 24, is_case: true }],
});

describe('UoM engine (platform-wide)', () => {
  it('always includes the base unit at factor 1, sorted ascending', () => {
    expect(pharmacy.base).toBe('tablet');
    expect(pharmacy.units.map((u) => u.uom)).toEqual(['tablet', 'strip', 'box']);
    expect(factorOf(pharmacy, 'tablet')).toBe(1);
    expect(factorOf(pharmacy, 'box')).toBe(30);
  });

  it('defaults purchase/sales units (purchase=box, sales=strip; base when unset)', () => {
    expect(pharmacy.purchase).toBe('box');
    expect(pharmacy.sales).toBe('strip');
    expect(fmcg.purchase).toBe('piece'); // no purchase_uom → base
    expect(fmcg.sales).toBe('piece');
  });

  it('converts to/from base', () => {
    expect(toBase(2, factorOf(pharmacy, 'box'))).toBe(60);   // 2 boxes = 60 tablets
    expect(fromBase(60, factorOf(pharmacy, 'box'))).toBe(2);
    expect(toBase(3, factorOf(fmcg, 'carton'))).toBe(72);
  });

  it('converts between arbitrary units through the base', () => {
    expect(convertUnits(pharmacy, 1, 'box', 'strip')).toBe(3);  // 1 box = 3 strips
    expect(convertUnits(pharmacy, 6, 'strip', 'box')).toBe(2);  // 6 strips = 2 boxes
    expect(convertUnits(fmcg, 1, 'carton', 'pack')).toBe(4);    // 24/6
  });

  it('converts prices per-unit ↔ per-base', () => {
    // a box costs 60 → 2 per tablet; 2 per tablet → 20 per strip
    expect(priceToBase(60, factorOf(pharmacy, 'box'))).toBe(2);
    expect(priceFromBase(2, factorOf(pharmacy, 'strip'))).toBe(20);
  });

  it('treats unknown units as the base (factor 1) and labels with the ratio', () => {
    expect(factorOf(pharmacy, 'pallet')).toBe(1);
    expect(unitLabel(pharmacy, 'box')).toBe('box (×30 tablet)');
    expect(unitLabel(pharmacy, 'tablet')).toBe('tablet');
  });

  it('falls back to unit/“unit” for the base when base_uom is missing', () => {
    expect(resolveUnits({ unit: 'piece' }).base).toBe('piece');
    expect(resolveUnits({}).base).toBe('unit');
  });
});
