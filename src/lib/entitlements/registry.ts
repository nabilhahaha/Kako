// Module & Feature Entitlement Engine — PURE resolution helpers (no I/O). Parse
// entitlement rows and decide, given a company's entitlement set, whether a module
// or feature is entitled. The permission→module map links a permission to the
// module(s) it unlocks (unmapped permissions are never gated — safe default).

import type { CompanyEntitlement, CompanyEntitlementRow } from './types';

/** Parse an erp_company_entitlements row into typed config. */
export function parseEntitlement(row: CompanyEntitlementRow): CompanyEntitlement {
  return {
    companyId: row.company_id,
    moduleKey: row.module_key,
    featureKey: row.feature_key ?? null,
    isEnabled: row.is_enabled ?? false,
    limitValue: row.limit_value ?? null,
    limitPeriod: row.limit_period ?? null,
    expiresAt: row.expires_at ?? null,
  };
}

/** Is an entitlement effective now (enabled + not expired)? Pure. */
export function entitlementActive(e: CompanyEntitlement, nowMs: number): boolean {
  if (!e.isEnabled) return false;
  if (e.expiresAt && Date.parse(e.expiresAt) <= nowMs) return false;
  return true;
}

/**
 * Is `moduleKey` (optionally `featureKey`) entitled for a company, given its
 * entitlement set? A feature is entitled only when BOTH its feature-level row (if
 * present) and its module-level row are active; if no feature row exists, the
 * module-level entitlement governs. Pure.
 */
export function isEntitledIn(
  entitlements: CompanyEntitlement[],
  moduleKey: string,
  featureKey: string | null,
  nowMs: number,
): boolean {
  const moduleRow = entitlements.find((e) => e.moduleKey === moduleKey && e.featureKey === null);
  if (!moduleRow || !entitlementActive(moduleRow, nowMs)) return false;
  if (!featureKey) return true;
  const featureRow = entitlements.find((e) => e.moduleKey === moduleKey && e.featureKey === featureKey);
  // No explicit feature row → governed by the (active) module entitlement.
  return featureRow ? entitlementActive(featureRow, nowMs) : true;
}

// ── Permission → module map ─────────────────────────────────────────────────
// Maps a permission to the module(s) it unlocks. Seeded here (kept beside the
// permission catalog); modules/packs extend it. An unmapped permission returns []
// and is therefore NEVER gated by entitlements (the existing permission check
// remains the sole authority). This is the safe-by-default contract.
const PERMISSION_MODULES: Record<string, string[]> = {
  // Van Sales / merchandising (field ops)
  'field.sales': ['van_sales'],
  'field.attach_media': ['merchandising'],
  // Route Management
  'route.create': ['route_management'],
  'route.import': ['route_management'],
  // Note: the change_requests.* and trade_spend.manage keys are intentionally
  // NOT mapped here — they are not part of the code Permission union and are
  // granted to no role, so they were inert map entries. Those engines gate via
  // their module entitlement + KAKO_* kill-switch; they will get first-class,
  // typed permissions when the engines ship (Governance Roadmap, Phase C).
  // Note: core-module permissions (sales.*, inventory.*, purchasing.*,
  // accounting.*, customers.*) are intentionally NOT mapped — core modules are
  // always available; only optional engines are entitlement-gated. Unmapped
  // permissions are never gated (the existing permission check stays authoritative).
};

/** The module(s) a permission unlocks (empty = never entitlement-gated). */
export function modulesForPermission(permission: string): string[] {
  return PERMISSION_MODULES[permission] ?? [];
}

export interface GateContext {
  isPlatformOwner?: boolean;
  isSuperAdmin?: boolean;
  companyId?: string | null;
}

/**
 * The modules the entitlement gate must verify for a permission — or `null` when
 * no entitlement check applies and access is governed solely by the existing
 * permission check. `null` is returned when: the flag is OFF (→ identical to
 * hasPermission), the actor is a platform owner / super admin, there is no company,
 * or the permission is unmapped (core/always-on). Pure.
 */
export function requiredEntitlementModules(
  permission: string,
  ctx: GateContext,
  entitlementsEnabled: boolean,
): string[] | null {
  if (!entitlementsEnabled) return null;
  if (ctx.isPlatformOwner || ctx.isSuperAdmin) return null;
  if (!ctx.companyId) return null;
  const mods = modulesForPermission(permission);
  return mods.length ? mods : null;
}
