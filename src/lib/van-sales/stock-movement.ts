// Van stock movement report — PURE aggregation (no I/O). Turns the raw stock
// movements of the van warehouse into a per-SKU report that EXPLAINS the current
// balance:  Opening + Load − Sales + Saleable Return − Damage Return − Expiry
// ± Adjustments = Current.  Built from existing erp_stock_movements; Damage Return
// and Expiry/Write-off have no movement types yet (they arrive with the Damage-
// Return split) so those columns are 0 until then.

export interface MovementRow {
  productId: string;
  movementType: string;
  quantity: number; // signed (out movements are negative)
  at: string;
}

export interface StockMovementRow {
  productId: string;
  name: string;
  opening: number;
  load: number;
  sales: number;          // displayed positive (subtracted in the formula)
  saleableReturn: number;
  damageReturn: number;   // 0 until the Damage-Return split lands
  expiry: number;         // 0 until a write-off/expiry movement type lands
  adjustment: number;     // signed (±)
  current: number;
}

export type StockCol = 'load' | 'sales' | 'saleableReturn' | 'damageReturn' | 'expiry' | 'adjustment';

/** Map a movement type to its report column (null = ignored). */
export function classifyMovement(movementType: string): StockCol | null {
  switch (movementType) {
    case 'transfer_in':
    case 'purchase_in':
    case 'transfer_out':            // van→warehouse unload nets against load
      return 'load';
    case 'sale_out':
      return 'sales';
    case 'return_in':
      return 'saleableReturn';
    case 'damage_return_in':        // future (Damage-Return split)
      return 'damageReturn';
    case 'write_off':
    case 'expiry_out':              // future
      return 'expiry';
    case 'adjustment':
      return 'adjustment';
    default:
      return null;
  }
}

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * Per-SKU movement rows (sorted by name) for the reporting period [dayStartMs, ∞).
 * `currentByProduct` is the authoritative on-hand (erp_inventory_stock); opening is
 * back-computed so the row reconciles (Opening = Current − net period movements).
 * Pure.
 */
export function computeStockMovement(
  movements: MovementRow[],
  currentByProduct: Map<string, number>,
  names: Record<string, string>,
  dayStartMs: number,
): StockMovementRow[] {
  const ids = new Set<string>([...currentByProduct.keys(), ...movements.map((m) => m.productId)]);
  const rows: StockMovementRow[] = [];

  for (const productId of ids) {
    let load = 0, salesSigned = 0, saleableReturn = 0, damageSigned = 0, expirySigned = 0, adjustment = 0;
    for (const m of movements) {
      if (m.productId !== productId) continue;
      if ((Date.parse(m.at) || 0) < dayStartMs) continue; // before the period → folds into opening
      const q = Number(m.quantity || 0);
      switch (classifyMovement(m.movementType)) {
        case 'load': load += q; break;
        case 'sales': salesSigned += q; break;            // negative
        case 'saleableReturn': saleableReturn += q; break;
        case 'damageReturn': damageSigned += q; break;    // negative
        case 'expiry': expirySigned += q; break;          // negative
        case 'adjustment': adjustment += q; break;
        default: break;
      }
    }
    const netPeriod = load + salesSigned + saleableReturn + damageSigned + expirySigned + adjustment;
    const current = currentByProduct.get(productId) ?? 0;
    const opening = r3(current - netPeriod);
    rows.push({
      productId,
      name: names[productId] ?? productId,
      opening,
      load: r3(load),
      sales: r3(-salesSigned),
      saleableReturn: r3(saleableReturn),
      damageReturn: r3(-damageSigned),
      expiry: r3(-expirySigned),
      adjustment: r3(adjustment),
      current: r3(current),
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export interface StockMovementTotals {
  opening: number; load: number; sales: number; saleableReturn: number;
  damageReturn: number; expiry: number; adjustment: number; current: number;
}

/** Column totals across all SKUs. Pure. */
export function stockMovementTotals(rows: StockMovementRow[]): StockMovementTotals {
  const sum = (k: keyof StockMovementTotals) => r3(rows.reduce((s, r) => s + (r[k] as number), 0));
  return {
    opening: sum('opening'), load: sum('load'), sales: sum('sales'), saleableReturn: sum('saleableReturn'),
    damageReturn: sum('damageReturn'), expiry: sum('expiry'), adjustment: sum('adjustment'), current: sum('current'),
  };
}
