import { describe, it, expect } from 'vitest';
import { resolveUnits } from './uom';
import {
  sellableUnits, isSellable, validateSell, validatePurchase, validateConversion,
  validateQty, baseMovement, lineUnitPrice, stockInUnit, DEFAULT_RULES, type UnitRules,
} from './uom-rules';

// Pharmacy: tablet (base) / strip ×10 / box ×30; sales unit = strip.
const pharm = resolveUnits({
  base_uom: 'tablet', default_sell_uom: 'strip',
  uoms: [{ uom: 'strip', factor: 10 }, { uom: 'box', factor: 30 }],
});
// Water: piece (base) / carton ×12 — "carton only".
const water = resolveUnits({ base_uom: 'piece', uoms: [{ uom: 'carton', factor: 12 }] });

const ALL: UnitRules = { sellMode: 'all', allowFractional: false };
const SALES: UnitRules = { sellMode: 'sales', allowFractional: false };
const BASE: UnitRules = { sellMode: 'base', allowFractional: false };
const FRAC: UnitRules = { sellMode: 'all', allowFractional: true };

describe('unit governance', () => {
  it('sellMode restricts the sellable units', () => {
    expect(sellableUnits(pharm, ALL).map((u) => u.uom)).toEqual(['tablet', 'strip', 'box']);
    expect(sellableUnits(pharm, SALES).map((u) => u.uom)).toEqual(['strip']);
    expect(sellableUnits(pharm, BASE).map((u) => u.uom)).toEqual(['tablet']);
  });

  it('blocks selling a non-allowed unit (water = carton only)', () => {
    const cartonOnly: UnitRules = { sellMode: 'sales', allowFractional: false };
    const waterCarton = resolveUnits({ base_uom: 'piece', default_sell_uom: 'carton', uoms: [{ uom: 'carton', factor: 12 }] });
    expect(isSellable(waterCarton, cartonOnly, 'carton')).toBe(true);
    expect(isSellable(waterCarton, cartonOnly, 'piece')).toBe(false);
    expect(validateSell(1, 'piece', waterCarton, cartonOnly)).toEqual({ ok: false, error: 'unit_not_sellable' });
  });

  it('enforces whole quantities unless fractional is allowed', () => {
    expect(validateQty(1.5, 'strip', pharm, ALL)).toEqual({ ok: false, error: 'qty_whole' });
    expect(validateQty(1.5, 'strip', pharm, FRAC)).toEqual({ ok: true });
    expect(validateQty(0, 'strip', pharm, ALL)).toEqual({ ok: false, error: 'qty_positive' });
  });

  it('guards invalid conversions (unknown unit)', () => {
    expect(validateConversion(pharm, 'pallet')).toEqual({ ok: false, error: 'unit_unknown' });
    expect(validateConversion(pharm, 'box')).toEqual({ ok: true });
  });

  it('purchase allows any known unit and fractional', () => {
    expect(validatePurchase(2.5, 'carton', water)).toEqual({ ok: true });
    expect(validatePurchase(1, 'crate', water)).toEqual({ ok: false, error: 'unit_unknown' });
  });

  it('builds a base-unit movement preserving the audit trail', () => {
    expect(baseMovement(2, 'box', pharm)).toEqual({ entered_unit: 'box', entered_qty: 2, factor: 30, base_qty: 60 });
    expect(baseMovement(3, 'carton', water).base_qty).toBe(36);
  });

  it('derives unit price from base and reports stock in any unit', () => {
    expect(lineUnitPrice(2, 'box', pharm)).toBe(60);     // 2/tablet × 30
    expect(stockInUnit(60, 'box', pharm)).toBe(2);        // 60 tablets = 2 boxes
    expect(stockInUnit(36, 'carton', water)).toBe(3);
  });

  it('defaults are all-units, whole quantities', () => {
    expect(DEFAULT_RULES).toEqual({ sellMode: 'all', allowFractional: false });
  });
});
