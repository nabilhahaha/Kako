import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserContext } from '@/lib/erp/auth-context';
import { VAN_SALES_ENABLED } from './index';
import { loadVanSalesSettings } from './settings-server';
import { evaluatePilotReadiness, type ReadinessFacts, type ReadinessReport } from './pilot-readiness';

// ============================================================================
// FMCG Pilot Readiness — server gatherer (read-only). Collects the company's
// configuration under the caller's RLS and runs the pure evaluator. Changes
// nothing. Used by the admin readiness page to auto-run the Go/No-Go gates.
// ============================================================================

type Row = Record<string, unknown>;
const sid = (v: unknown) => (v == null ? '' : String(v));

/** Gather facts for the caller's company and evaluate pilot readiness. */
export async function gatherPilotReadiness(supabase: SupabaseClient, ctx: UserContext): Promise<ReadinessReport> {
  const companyId = ctx.companyId;
  if (!companyId) {
    return evaluatePilotReadiness({
      vanSalesActive: false, salesmenCount: 0, vans: [], salesmenWithoutVan: [],
      productsTotal: 0, zeroPricedProducts: [], multiUomProducts: [],
      customersTotal: 0, customersApprovedOnBranch: 0, activeReturnReasons: 0,
      allowNegativeVanStock: false, discountCapPct: null,
    });
  }

  const settings = await loadVanSalesSettings(supabase, companyId);
  const vanSalesActive = VAN_SALES_ENABLED() && settings.isEnabled;

  // Branches of the company.
  const { data: branchRows } = await supabase.from('erp_branches').select('id').eq('company_id', companyId);
  const branchIds = ((branchRows ?? []) as Row[]).map((r) => sid(r.id));

  // Vans (active, is_van) on those branches + their stock.
  let vans: { id: string; assignedTo: string | null; stockUnits: number }[] = [];
  if (branchIds.length) {
    const { data: vanRows } = await supabase
      .from('erp_warehouses').select('id, assigned_to')
      .in('branch_id', branchIds).eq('is_van', true).eq('is_active', true);
    const vanList = ((vanRows ?? []) as Row[]).map((r) => ({ id: sid(r.id), assignedTo: r.assigned_to ? sid(r.assigned_to) : null }));
    const vanIds = vanList.map((v) => v.id);
    const stockByVan = new Map<string, number>();
    if (vanIds.length) {
      const { data: stockRows } = await supabase
        .from('erp_inventory_stock').select('warehouse_id, quantity').in('warehouse_id', vanIds);
      for (const s of (stockRows ?? []) as Row[]) {
        const w = sid(s.warehouse_id); stockByVan.set(w, (stockByVan.get(w) ?? 0) + Number(s.quantity ?? 0));
      }
    }
    vans = vanList.map((v) => ({ ...v, stockUnits: stockByVan.get(v.id) ?? 0 }));
  }

  // Salesmen on those branches, and which lack a van.
  let salesmenCount = 0; let salesmenWithoutVan: string[] = [];
  if (branchIds.length) {
    const { data: sm } = await supabase
      .from('erp_user_branches').select('user_id').in('branch_id', branchIds).eq('role', 'salesman');
    const salesmanIds = [...new Set(((sm ?? []) as Row[]).map((r) => sid(r.user_id)))];
    salesmenCount = salesmanIds.length;
    const assigned = new Set(vans.map((v) => v.assignedTo).filter(Boolean) as string[]);
    const missing = salesmanIds.filter((id) => !assigned.has(id));
    if (missing.length) {
      const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', missing);
      const nameById = new Map(((profs ?? []) as Row[]).map((p) => [sid(p.id), sid(p.full_name)]));
      salesmenWithoutVan = missing.map((id) => nameById.get(id) || id.slice(0, 8));
    }
  }

  // Products: total active, zero-priced, multi-UoM.
  const { data: prodRows } = await supabase
    .from('erp_products_catalog').select('id, code, sell_price').eq('company_id', companyId).eq('is_active', true).limit(5000);
  const products = (prodRows ?? []) as Row[];
  const productsTotal = products.length;
  const codeById = new Map(products.map((p) => [sid(p.id), sid(p.code)]));
  const zeroPricedProducts = products.filter((p) => Number(p.sell_price ?? 0) <= 0).map((p) => sid(p.code));

  let multiUomProducts: string[] = [];
  if (productsTotal > 0) {
    const { data: uomRows } = await supabase.from('erp_product_uoms').select('product_id').eq('company_id', companyId).limit(20000);
    const count = new Map<string, number>();
    for (const u of (uomRows ?? []) as Row[]) { const pid = sid(u.product_id); count.set(pid, (count.get(pid) ?? 0) + 1); }
    multiUomProducts = [...count.entries()].filter(([pid, n]) => n > 1 && codeById.has(pid)).map(([pid]) => codeById.get(pid)!);
  }

  // Customers: total + approved-on-branch.
  const { count: customersTotal } = await supabase
    .from('erp_customers').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
  let customersApprovedOnBranch = 0;
  if (branchIds.length) {
    const { count } = await supabase
      .from('erp_customers').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('is_approved', true).in('branch_id', branchIds);
    customersApprovedOnBranch = count ?? 0;
  }

  // Active return reasons.
  const { count: activeReturnReasons } = await supabase
    .from('erp_return_reasons').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true);

  const facts: ReadinessFacts = {
    vanSalesActive,
    salesmenCount,
    vans: vans.map((v) => ({ assignedTo: v.assignedTo, stockUnits: v.stockUnits })),
    salesmenWithoutVan,
    productsTotal,
    zeroPricedProducts,
    multiUomProducts,
    customersTotal: customersTotal ?? 0,
    customersApprovedOnBranch,
    activeReturnReasons: activeReturnReasons ?? 0,
    allowNegativeVanStock: settings.allowNegativeVanStock,
    discountCapPct: settings.discountCapPct,
  };
  return evaluatePilotReadiness(facts);
}
