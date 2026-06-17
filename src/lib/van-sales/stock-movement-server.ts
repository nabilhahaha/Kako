import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeStockMovement, stockMovementTotals, type MovementRow, type StockMovementRow, type StockMovementTotals } from './stock-movement';

// Loads the van stock-movement report for a salesman's van warehouse. Read-only,
// from existing data (erp_stock_movements + erp_inventory_stock). One source of
// truth for the report page and the printable view. Period defaults to the day.

export interface StockMovementReport {
  warehouseId: string | null;
  warehouseName: string | null;
  rows: StockMovementRow[];
  totals: StockMovementTotals;
}

export async function loadStockMovementReport(
  supabase: SupabaseClient,
  salesmanId: string,
  date: string,
  locale: string,
): Promise<StockMovementReport> {
  const empty: StockMovementReport = { warehouseId: null, warehouseName: null, rows: [], totals: stockMovementTotals([]) };

  const { data: van } = await supabase
    .from('erp_warehouses').select('id, name, name_ar')
    .eq('is_van', true).eq('assigned_to', salesmanId).eq('is_active', true)
    .limit(1).maybeSingle();
  const wh = van as { id: string; name: string; name_ar: string | null } | null;
  if (!wh) return empty;

  const [{ data: moves }, { data: stock }] = await Promise.all([
    supabase.from('erp_stock_movements').select('product_id, movement_type, quantity, created_at').eq('warehouse_id', wh.id).limit(5000),
    supabase.from('erp_inventory_stock').select('product_id, quantity').eq('warehouse_id', wh.id).limit(2000),
  ]);

  const movements: MovementRow[] = ((moves ?? []) as { product_id: string; movement_type: string; quantity: number; created_at: string }[])
    .map((m) => ({ productId: m.product_id, movementType: m.movement_type, quantity: Number(m.quantity ?? 0), at: m.created_at }));
  const currentByProduct = new Map<string, number>();
  for (const s of (stock ?? []) as { product_id: string; quantity: number | null }[]) currentByProduct.set(s.product_id, Number(s.quantity ?? 0));

  // Product names.
  const ids = Array.from(new Set<string>([...currentByProduct.keys(), ...movements.map((m) => m.productId)]));
  const names: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: prods } = await supabase.from('erp_products_catalog').select('id, name, name_ar').in('id', ids);
    for (const p of (prods as { id: string; name: string; name_ar: string | null }[]) ?? []) names[p.id] = locale === 'ar' ? p.name_ar || p.name : p.name;
  }

  const dayStartMs = Date.parse(`${date}T00:00:00`);
  const rows = computeStockMovement(movements, currentByProduct, names, dayStartMs);
  return { warehouseId: wh.id, warehouseName: locale === 'ar' ? wh.name_ar || wh.name : wh.name, rows, totals: stockMovementTotals(rows) };
}
