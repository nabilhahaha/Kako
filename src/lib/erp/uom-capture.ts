import { factorOf, toBase, type ProductUnits } from './uom';

/**
 * U2 — Transaction-level UoM capture (shared, company-wide).
 *
 * Turns an entered (uom, qty) into the fields a transaction line should store:
 * the snapshot columns (entered_uom / entered_qty / uom_factor) PLUS the BASE
 * quantity that the existing stock/finance logic continues to use. The base-unit
 * inventory invariant is preserved: callers write `baseQty` into the line's
 * `quantity`, and the snapshot columns make the line self-describing.
 *
 * Pure (no DB) so it is unit-testable; the server wrapper loads ProductUnits and
 * calls this. DORMANT until the sell/buy flows (U3/U4) adopt it.
 */
export interface LineUom {
  /** The unit entered; null when the entry was already in base units. */
  entered_uom: string | null;
  /** The quantity in entered_uom; null when base. */
  entered_qty: number | null;
  /** Base units per entered_uom at write time (snapshot); null when base. */
  uom_factor: number | null;
  /** The quantity in BASE units — what the line's `quantity` should store. */
  baseQty: number;
}

/**
 * Resolve the line UoM fields for an entered quantity.
 * - If `enteredUom` is empty or equals the base unit, the line is base-unit
 *   (snapshot columns null, baseQty = enteredQty) — identical to today's rows.
 * - Otherwise baseQty = enteredQty × factor, and the snapshot columns are filled.
 */
export function lineUomFields(
  units: ProductUnits | null,
  enteredUom: string | null | undefined,
  enteredQty: number,
): LineUom {
  const qty = Number(enteredQty) || 0;
  const uom = (enteredUom ?? '').trim();
  const base = units?.base ?? '';
  if (!units || !uom || uom === base) {
    return { entered_uom: null, entered_qty: null, uom_factor: null, baseQty: qty };
  }
  const factor = factorOf(units, uom);
  return { entered_uom: uom, entered_qty: qty, uom_factor: factor, baseQty: toBase(qty, factor) };
}
