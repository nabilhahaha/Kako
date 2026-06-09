import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserContext } from '@/lib/erp/auth-context';
import { VAN_SALES_ENABLED } from './index';

// ============================================================================
// Van Sales — per-tenant enablement + policy (Phase B). KAKO_VAN_SALES is the
// platform master switch; erp_van_sales_settings is the per-company toggle +
// policy. A tenant is "active" only when BOTH are ON. Safe defaults when no row.
// ============================================================================

export interface VanSalesSettings {
  isEnabled: boolean;
  requirePhysicalCountOnClose: boolean;
  allowNegativeVanStock: boolean;
  autoConfirmDirectLoad: boolean;
  discountCapPct: number | null;
}

export const DEFAULT_VAN_SALES_SETTINGS: VanSalesSettings = {
  isEnabled: false,
  requirePhysicalCountOnClose: true,
  allowNegativeVanStock: false,
  autoConfirmDirectLoad: false,
  discountCapPct: null,
};

interface Row {
  is_enabled: boolean;
  require_physical_count_on_close: boolean;
  allow_negative_van_stock: boolean;
  auto_confirm_direct_load: boolean;
  discount_cap_pct: number | null;
}

/** Load a company's van-sales settings (safe defaults when no row exists). */
export async function loadVanSalesSettings(supabase: SupabaseClient, companyId: string): Promise<VanSalesSettings> {
  const { data } = await supabase
    .from('erp_van_sales_settings')
    .select('is_enabled, require_physical_count_on_close, allow_negative_van_stock, auto_confirm_direct_load, discount_cap_pct')
    .eq('company_id', companyId)
    .maybeSingle();
  if (!data) return DEFAULT_VAN_SALES_SETTINGS;
  const r = data as Row;
  return {
    isEnabled: r.is_enabled,
    requirePhysicalCountOnClose: r.require_physical_count_on_close,
    allowNegativeVanStock: r.allow_negative_van_stock,
    autoConfirmDirectLoad: r.auto_confirm_direct_load,
    discountCapPct: r.discount_cap_pct,
  };
}

/** True when Van Sales is active for the caller's company — the platform flag AND
 *  the per-company toggle both ON. The single enablement gate for tenant surfaces. */
export async function isVanSalesActive(supabase: SupabaseClient, ctx: UserContext): Promise<boolean> {
  if (!VAN_SALES_ENABLED()) return false;
  if (!ctx.companyId) return false;
  const s = await loadVanSalesSettings(supabase, ctx.companyId);
  if (!s.isEnabled) return false;
  // Entitlement subsumption (fallback-safe): honored only when KAKO_ENTITLEMENTS is
  // ON and the owner has set a van_sales entitlement; otherwise behaves as before.
  const { entitlementAllows } = await import('@/lib/entitlements/gate-server');
  return entitlementAllows(supabase, ctx.companyId, 'van_sales');
}
