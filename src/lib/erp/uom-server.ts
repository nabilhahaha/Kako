import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveUnits, type ProductUnits } from './uom';
import { type UnitRules, type SellMode } from './uom-rules';

/**
 * Server bridge: load a product's resolved units + governance rules from the DB
 * (catalog columns + erp_product_uoms). One place every consumer — onboarding,
 * batch intake, POS, inventory, reports — uses, so unit behaviour is consistent.
 * RLS-scoped via the caller's client.
 */

export interface ProductUnitConfig {
  units: ProductUnits;
  rules: UnitRules;
}

interface CatalogUnitRow {
  id: string;
  base_uom: string | null;
  unit: string | null;
  purchase_uom: string | null;
  sales_uom: string | null;
  default_sell_uom: string | null;
  sell_mode: SellMode | null;
  allow_fractional: boolean | null;
}
interface UomRow { product_id: string; uom: string; factor: number | string; barcode: string | null; is_case: boolean }

const CATALOG_COLS = 'id, base_uom, unit, purchase_uom, sales_uom, default_sell_uom, sell_mode, allow_fractional';

function build(cat: CatalogUnitRow, uoms: UomRow[]): ProductUnitConfig {
  return {
    units: resolveUnits({
      base_uom: cat.base_uom, unit: cat.unit, purchase_uom: cat.purchase_uom,
      sales_uom: cat.sales_uom, default_sell_uom: cat.default_sell_uom,
      uoms: uoms.map((u) => ({ uom: u.uom, factor: u.factor, barcode: u.barcode, is_case: u.is_case })),
    }),
    rules: { sellMode: (cat.sell_mode ?? 'all'), allowFractional: cat.allow_fractional ?? false },
  };
}

/** Units + rules for a single product. */
export async function loadProductUnits(
  supabase: SupabaseClient, productId: string,
): Promise<ProductUnitConfig | null> {
  const { data: cat } = await supabase
    .from('erp_products_catalog').select(CATALOG_COLS).eq('id', productId).maybeSingle();
  if (!cat) return null;
  const { data: uoms } = await supabase
    .from('erp_product_uoms').select('product_id, uom, factor, barcode, is_case').eq('product_id', productId);
  return build(cat as CatalogUnitRow, (uoms ?? []) as UomRow[]);
}

/** Units + rules for many products at once (avoids N+1 in checkout/reports). */
export async function loadProductUnitsMany(
  supabase: SupabaseClient, productIds: string[],
): Promise<Map<string, ProductUnitConfig>> {
  const out = new Map<string, ProductUnitConfig>();
  const ids = [...new Set(productIds)].filter(Boolean);
  if (ids.length === 0) return out;
  const [{ data: cats }, { data: uoms }] = await Promise.all([
    supabase.from('erp_products_catalog').select(CATALOG_COLS).in('id', ids),
    supabase.from('erp_product_uoms').select('product_id, uom, factor, barcode, is_case').in('product_id', ids),
  ]);
  const uomsByProduct = new Map<string, UomRow[]>();
  for (const u of (uoms ?? []) as UomRow[]) {
    (uomsByProduct.get(u.product_id) ?? uomsByProduct.set(u.product_id, []).get(u.product_id)!).push(u);
  }
  for (const cat of (cats ?? []) as CatalogUnitRow[]) {
    out.set(cat.id, build(cat, uomsByProduct.get(cat.id) ?? []));
  }
  return out;
}
