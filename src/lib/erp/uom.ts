/**
 * VANTORA — Multi-unit (Unit of Measure) engine. Platform-wide and pure: NO DB,
 * NO React, reusable by every industry pack (pharmacy box→strip→tablet, FMCG
 * carton→pack→piece, warehouse pallet→carton→piece, …).
 *
 * Model (mirrors the DB):
 *   • base unit            — the smallest unit stock is tracked in (factor 1).
 *     The INVENTORY unit is always the base unit, so conversions stay sane.
 *   • alternative units    — each carries `factor` = how many BASE units it holds
 *     (erp_product_uoms.factor). e.g. carton factor 24 ⇒ 1 carton = 24 base.
 *   • purchase / sales unit — defaults for receiving and selling.
 *
 * All quantities convert through the base unit.
 */

export interface UnitDef {
  uom: string;
  /** How many BASE units this unit holds (base unit itself = 1). */
  factor: number;
  barcode?: string | null;
  isCase?: boolean;
}

export interface ProductUnits {
  /** Base & inventory unit. */
  base: string;
  /** All sellable/stockable units (includes the base unit, factor 1). */
  units: UnitDef[];
  /** Default purchase unit (receiving). Falls back to base. */
  purchase?: string | null;
  /** Default sales unit. Falls back to base. */
  sales?: string | null;
}

const r4 = (n: number) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;

/** Build a ProductUnits from plain DB-shaped inputs (catalog + uom rows). The
 *  base unit is always present with factor 1, even if it has no uom row. */
export function resolveUnits(input: {
  base_uom?: string | null;
  unit?: string | null;
  purchase_uom?: string | null;
  sales_uom?: string | null;
  default_sell_uom?: string | null;
  uoms?: Array<{ uom: string; factor: number | string; barcode?: string | null; is_case?: boolean }>;
}): ProductUnits {
  const base = (input.base_uom || input.unit || 'unit').trim() || 'unit';
  const map = new Map<string, UnitDef>();
  map.set(base, { uom: base, factor: 1 });
  for (const u of input.uoms ?? []) {
    const name = (u.uom || '').trim();
    if (!name) continue;
    const factor = Number(u.factor) || (name === base ? 1 : 0);
    if (factor <= 0) continue;
    map.set(name, { uom: name, factor, barcode: u.barcode ?? null, isCase: u.is_case ?? false });
  }
  return {
    base,
    units: [...map.values()].sort((a, b) => a.factor - b.factor),
    purchase: input.purchase_uom?.trim() || base,
    sales: (input.default_sell_uom || input.sales_uom)?.trim() || base,
  };
}

/** Factor (base units per `uom`); 1 for the base or an unknown unit. */
export function factorOf(units: ProductUnits, uom: string): number {
  return units.units.find((u) => u.uom === uom)?.factor ?? 1;
}

/** Quantity in `uom` → quantity in BASE units. */
export function toBase(qtyInUom: number, factor: number): number {
  return r4((Number(qtyInUom) || 0) * (Number(factor) || 1));
}

/** Quantity in BASE units → quantity in `uom`. */
export function fromBase(baseQty: number, factor: number): number {
  const f = Number(factor) || 1;
  return r4((Number(baseQty) || 0) / f);
}

/** Convert a quantity from one unit to another (through the base). */
export function convertUnits(units: ProductUnits, qty: number, fromUom: string, toUom: string): number {
  return r4(toBase(qty, factorOf(units, fromUom)) / (factorOf(units, toUom) || 1));
}

/** Price entered per `uom` → equivalent price per BASE unit. */
export function priceToBase(pricePerUom: number, factor: number): number {
  const f = Number(factor) || 1;
  return r4((Number(pricePerUom) || 0) / f);
}

/** Price per BASE unit → price per `uom`. */
export function priceFromBase(pricePerBase: number, factor: number): number {
  return r4((Number(pricePerBase) || 0) * (Number(factor) || 1));
}

/** Human label like "carton (×24 tablet)" for selectors. */
export function unitLabel(units: ProductUnits, uom: string): string {
  const f = factorOf(units, uom);
  return f === 1 ? uom : `${uom} (×${f} ${units.base})`;
}
