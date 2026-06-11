/**
 * VANTORA — Unit governance (rules + validation) on top of the multi-unit
 * engine (uom.ts). Pure, platform-wide, no DB/React. Prevents invalid
 * conversions and out-of-policy quantities BEFORE they reach inventory.
 *
 * Rules per product:
 *   • sellMode        — which units may be sold: 'base' | 'sales' | 'all'.
 *   • allowFractional — whether non-integer quantities are allowed.
 * Inventory invariant: every movement is stored in the BASE unit; the entered
 * unit, the entered quantity and the converted base quantity are all preserved
 * for the audit trail.
 */

import {
  type ProductUnits, type UnitDef, factorOf, toBase, priceFromBase, convertUnits,
} from './uom';

export type SellMode = 'base' | 'sales' | 'all';

export interface UnitRules {
  sellMode: SellMode;
  allowFractional: boolean;
}

export const DEFAULT_RULES: UnitRules = { sellMode: 'all', allowFractional: false };

/** The units a product MAY be sold in, per its sell mode. */
export function sellableUnits(units: ProductUnits, rules: UnitRules): UnitDef[] {
  if (rules.sellMode === 'base') return units.units.filter((u) => u.uom === units.base);
  if (rules.sellMode === 'sales') {
    const sales = units.sales || units.base;
    return units.units.filter((u) => u.uom === sales);
  }
  return units.units;
}

export function isSellable(units: ProductUnits, rules: UnitRules, uom: string): boolean {
  return sellableUnits(units, rules).some((u) => u.uom === uom);
}

export interface ValidationResult { ok: boolean; error?: string }

/** A unit must exist with a positive factor — guards against impossible
 *  conversions (unknown/zero-factor units) before any stock math runs. */
export function validateConversion(units: ProductUnits, uom: string): ValidationResult {
  const def = units.units.find((u) => u.uom === uom);
  if (!def) return { ok: false, error: 'unit_unknown' };
  if (!(def.factor > 0)) return { ok: false, error: 'unit_factor_invalid' };
  return { ok: true };
}

/** Validate a quantity entered in a unit against the product rules. */
export function validateQty(
  qty: number, uom: string, units: ProductUnits, rules: UnitRules,
): ValidationResult {
  if (!(qty > 0)) return { ok: false, error: 'qty_positive' };
  const conv = validateConversion(units, uom);
  if (!conv.ok) return conv;
  if (!rules.allowFractional && !Number.isInteger(qty)) return { ok: false, error: 'qty_whole' };
  return { ok: true };
}

/** Validate a POS sell line: must be a sellable unit + a valid quantity. */
export function validateSell(
  qty: number, uom: string, units: ProductUnits, rules: UnitRules,
): ValidationResult {
  if (!isSellable(units, rules, uom)) return { ok: false, error: 'unit_not_sellable' };
  return validateQty(qty, uom, units, rules);
}

/** Validate a purchase/receiving line (any known unit with a valid quantity;
 *  fractional purchase is always allowed — you may buy a part-carton). */
export function validatePurchase(
  qty: number, uom: string, units: ProductUnits,
): ValidationResult {
  if (!(qty > 0)) return { ok: false, error: 'qty_positive' };
  return validateConversion(units, uom);
}

export interface BaseMovement {
  entered_unit: string;
  entered_qty: number;
  factor: number;
  base_qty: number;
}

/** Build the audit-friendly, base-unit movement record for a quantity entered in
 *  a unit. ALL stock movements use `base_qty`; the rest preserves the trail. */
export function baseMovement(qty: number, uom: string, units: ProductUnits): BaseMovement {
  const factor = factorOf(units, uom);
  return { entered_unit: uom, entered_qty: qty, factor, base_qty: toBase(qty, factor) };
}

/** Line price for a unit, derived from a base-unit price (per-base × factor). */
export function lineUnitPrice(pricePerBase: number, uom: string, units: ProductUnits): number {
  return priceFromBase(pricePerBase, factorOf(units, uom));
}

/** Stock (held in base units) expressed in a chosen unit — for reports/POS. */
export function stockInUnit(baseQty: number, uom: string, units: ProductUnits): number {
  return convertUnits(units, baseQty, units.base, uom);
}
