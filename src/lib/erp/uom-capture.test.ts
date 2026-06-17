import { describe, it, expect } from 'vitest';
import { lineUomFields } from './uom-capture';
import { multiUomEnabled, resolveUnits } from './uom';

// Carton(24) / Inner(6) / Piece(1) hierarchy
const units = resolveUnits({
  base_uom: 'piece',
  uoms: [
    { uom: 'piece', factor: 1 },
    { uom: 'inner', factor: 6, is_case: false },
    { uom: 'carton', factor: 24, is_case: true },
  ],
});

describe('lineUomFields', () => {
  it('base unit entry → snapshot null, baseQty = entered (legacy-identical)', () => {
    expect(lineUomFields(units, 'piece', 10)).toEqual({
      entered_uom: null, entered_qty: null, uom_factor: null, baseQty: 10,
    });
  });

  it('empty/undefined uom → treated as base', () => {
    expect(lineUomFields(units, '', 5).baseQty).toBe(5);
    expect(lineUomFields(units, undefined, 5).entered_uom).toBeNull();
  });

  it('carton → converts to base and snapshots factor', () => {
    expect(lineUomFields(units, 'carton', 2)).toEqual({
      entered_uom: 'carton', entered_qty: 2, uom_factor: 24, baseQty: 48,
    });
  });

  it('inner → base via factor 6', () => {
    expect(lineUomFields(units, 'inner', 3)).toEqual({
      entered_uom: 'inner', entered_qty: 3, uom_factor: 6, baseQty: 18,
    });
  });

  it('null units (no config) → base passthrough', () => {
    expect(lineUomFields(null, 'carton', 2)).toEqual({
      entered_uom: null, entered_qty: null, uom_factor: null, baseQty: 2,
    });
  });

  it('unknown uom → factor 1 (safe; treated as base-equivalent)', () => {
    expect(lineUomFields(units, 'pallet', 2).baseQty).toBe(2);
  });
});

describe('multiUomEnabled', () => {
  it('off by default', () => {
    expect(multiUomEnabled(null)).toBe(false);
    expect(multiUomEnabled({})).toBe(false);
  });
  it('platform flag enables it (company-wide)', () => {
    expect(multiUomEnabled({ 'platform.multi_uom': true })).toBe(true);
  });
  it('legacy pharmacy flag still enables it', () => {
    expect(multiUomEnabled({ 'pharmacy.multi_unit_support': true })).toBe(true);
  });
});
