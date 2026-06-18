import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPermission, type Permission } from '@/lib/erp/permissions';
import type { UserContext } from '@/lib/erp/auth-context';
import { ENTITLEMENTS_ENABLED } from './flags';
import { requiredEntitlementModules, parseEntitlement, isEntitledIn, moduleEntitledOrFallback } from './registry';
import type { CompanyEntitlement, CompanyEntitlementRow } from './types';

// The entitlement GATE — additive on top of hasPermission. While KAKO_ENTITLEMENTS
// is OFF (or for platform owners / unmapped permissions) it returns EXACTLY
// hasPermission(ctx, perm) — zero behavior change. When ON, a company must also be
// entitled to the module(s) the permission unlocks. RLS-scoped reads; the existing
// auth-context resolution is untouched (per-user override application is the
// separate, approval-gated E8 step).

async function loadEntitlements(supabase: SupabaseClient, companyId: string): Promise<CompanyEntitlement[]> {
  const { data } = await supabase
    .from('erp_company_entitlements')
    .select('company_id, module_key, feature_key, is_enabled, limit_value, limit_period, expires_at')
    .eq('company_id', companyId);
  return ((data ?? []) as unknown as CompanyEntitlementRow[]).map(parseEntitlement);
}

/** Is a company entitled to a module (and optional feature)? RLS-scoped. */
export async function isEntitled(
  supabase: SupabaseClient,
  companyId: string,
  moduleKey: string,
  featureKey: string | null = null,
): Promise<boolean> {
  const ents = await loadEntitlements(supabase, companyId);
  return isEntitledIn(ents, moduleKey, featureKey, Date.now());
}

/** Permission AND entitlement. Drop-in beside hasPermission for gated call sites. */
export async function hasPermissionWithEntitlement(
  supabase: SupabaseClient,
  ctx: UserContext,
  permission: Permission,
): Promise<boolean> {
  if (!hasPermission(ctx, permission)) return false;
  const required = requiredEntitlementModules(
    permission,
    { isPlatformOwner: ctx.isPlatformOwner, isSuperAdmin: ctx.isSuperAdmin, companyId: ctx.companyId },
    ENTITLEMENTS_ENABLED(),
  );
  if (!required) return true;   // flag OFF / owner / no company / unmapped → permission check is authoritative
  const ents = await loadEntitlements(supabase, ctx.companyId as string);
  const now = Date.now();
  return required.every((m) => isEntitledIn(ents, m, null, now));
}

/**
 * Fallback-safe module gate for ENGINE activation (van_sales / alerts /
 * change_requests). Allows when KAKO_ENTITLEMENTS is OFF or when no module
 * entitlement row exists for the company; honors the row when an owner has set one.
 * So existing engines keep working until an owner opts a company into entitlement
 * control. RLS-scoped read (or service client for the alerts evaluator).
 */
export async function entitlementAllows(
  supabase: SupabaseClient,
  companyId: string,
  moduleKey: string,
): Promise<boolean> {
  if (!ENTITLEMENTS_ENABLED()) return true;
  const ents = await loadEntitlements(supabase, companyId);
  return moduleEntitledOrFallback(ents, moduleKey, true, Date.now());
}
