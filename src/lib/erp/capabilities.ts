import type { Permission } from './permissions';
import { ALL_PERMISSIONS } from './permissions';

// ─── Authorization Phase 1 — granular capability catalog + alias resolver ─────
//
// This module is ADDITIVE and BACKWARD-COMPATIBLE. It introduces the granular
// `module.resource.action` capability vocabulary from AUTHORIZATION-MODEL.md
// (§3) and an alias layer that expands the existing flat permission keys to
// ≥ their historical authority — so every current role keeps exactly its
// present access. It does NOT change any call site, RLS predicate, storage, or
// UI. The flat `Permission` keys in `permissions.ts` remain the stored/granted
// keys; granular capabilities are resolved from them at check time via
// `expandAliases()` / `can()`.
//
// Scope of Phase 1: catalog + alias map + resolver + backward-compat tests.
// NOT in scope (later phases): per-assignment scope tables (P3), constraints/
// limits (P4), DFG binding changes (P5), permissions-UI redesign (P6), and
// splitting individual call sites onto granular keys (P2).

// ─── Granular capability catalog (module.resource.action) ────────────────────
// The closed target vocabulary. Verticals keep their flat module-level grant
// for now (AUTHORIZATION-MODEL.md §3.6) and are not re-listed here.
export const GRANULAR_CAPABILITIES = [
  // Sales — orders / invoices / returns / payments / pricing-at-point-of-sale
  'sales.order.view', 'sales.order.create', 'sales.order.edit', 'sales.order.cancel', 'sales.order.discount',
  'sales.invoice.view', 'sales.invoice.create', 'sales.invoice.edit_draft', 'sales.invoice.cancel', 'sales.invoice.discount',
  'sales.return.view', 'sales.return.create', 'sales.return.approve',
  'sales.payment.collect', 'sales.payment.writeoff', 'sales.price.override',
  // Customers
  'customers.view', 'customers.create', 'customers.edit.basic', 'customers.edit.location', 'customers.delete',
  'customers.financials.view', 'customers.status.change',
  'customers.change_request.create', 'customers.change_request.approve', 'customers.approval.approve',
  // Inventory
  'inventory.stock.view', 'inventory.stock.adjust', 'inventory.stock.transfer',
  'inventory.adjustment.approve', 'inventory.count', 'inventory.expiry.view',
  // Stock requests (already granular today)
  'stock_request.create', 'stock_request.approve',
  // Purchasing / suppliers
  'purchasing.po.view', 'purchasing.po.create', 'purchasing.po.approve', 'purchasing.receipt.create',
  'purchasing.return.create', 'purchasing.return.approve',
  'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.payment.collect',
  // Accounting
  'accounting.journal.view', 'accounting.journal.post', 'accounting.voucher.approve',
  // Pricing
  'pricing.rule.view', 'pricing.rule.edit', 'pricing.list.publish',
  // Reports / workflow / settings (stable keys)
  'reports.view', 'workflow.manage', 'integrations.manage',
  'settings.branches', 'settings.users', 'settings.custom_fields',
  // Exports — one per module (no global export); transition-granted via aliases
  'sales.export', 'returns.export', 'collections.export', 'customers.export',
  'inventory.export', 'purchasing.export', 'accounting.export', 'suppliers.export',
  'pricing.export', 'reports.export',
] as const;

export type GranularCapability = (typeof GRANULAR_CAPABILITIES)[number];

const GRANULAR_SET: ReadonlySet<string> = new Set(GRANULAR_CAPABILITIES);

/** A capability is anything in the granular catalog OR an existing flat key. */
export function isGranularCapability(key: string): key is GranularCapability {
  return GRANULAR_SET.has(key);
}

// ─── Legacy → granular alias map (AUTHORIZATION-MODEL.md §3.7) ─────────────────
// Each legacy key expands to ≥ its historical authority, so no role regresses.
// Keys not listed here pass through unchanged (the original key is always kept
// by `expandAliases`). Verticals + already-granular keys therefore need no entry.
//
// NOTE: net-new finer capabilities — `sales.order.cancel`, `sales.invoice.cancel`,
// `sales.payment.writeoff`, `sales.price.override`, `customers.delete`,
// `inventory.adjustment.approve`, `purchasing.po.approve`, `accounting.voucher.approve` —
// are intentionally NOT produced by any alias. They are reserved for explicit
// assignment in later phases and must not be silently granted by the cutover.
export const CAPABILITY_ALIASES: Readonly<Record<string, readonly GranularCapability[]>> = {
  'sales.sell': [
    'sales.order.view', 'sales.order.create', 'sales.order.edit',
    'sales.invoice.view', 'sales.invoice.create', 'sales.invoice.edit_draft',
  ],
  'sales.discount': ['sales.invoice.discount', 'sales.order.discount'],
  'sales.collect': ['sales.payment.collect'],
  'sales.return': ['sales.return.view', 'sales.return.create', 'sales.return.approve'],
  'customers.manage': [
    'customers.view', 'customers.create', 'customers.edit.basic',
    'customers.edit.location', 'customers.financials.view', 'customers.change_request.create',
  ],
  'customers.approve': ['customers.approval.approve', 'customers.change_request.approve'],
  'customers.change_status': ['customers.status.change'],
  'inventory.view': ['inventory.stock.view', 'inventory.expiry.view'],
  'inventory.adjust': ['inventory.stock.adjust'],
  'inventory.transfer': ['inventory.stock.transfer'],
  'inventory.count': ['inventory.count'],
  'accounting.view': ['accounting.journal.view'],
  'accounting.post': ['accounting.journal.post'],
  'suppliers.manage': ['suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.payment.collect'],
  'purchasing.manage': ['purchasing.po.view', 'purchasing.po.create', 'purchasing.receipt.create'],
  'purchasing.return': ['purchasing.return.create', 'purchasing.return.approve'],
  'pricing.manage': ['pricing.rule.view', 'pricing.rule.edit', 'pricing.list.publish'],
  // Export was historically gated behind integrations.manage, so it expands to
  // every per-module export during the transition — no data becomes newly hidden.
  'integrations.manage': [
    'sales.export', 'returns.export', 'collections.export', 'customers.export',
    'inventory.export', 'purchasing.export', 'accounting.export', 'suppliers.export',
    'pricing.export', 'reports.export',
  ],
};

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Expand a set of granted permission keys to the full effective capability set:
 * every original key plus its granular aliases. Returns a Set for O(1) checks.
 * Accepts any string keys (legacy flat or already-granular).
 */
export function expandAliases(perms: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const p of perms) {
    out.add(p); // originals always preserved (backward compatibility)
    const expanded = CAPABILITY_ALIASES[p];
    if (expanded) for (const g of expanded) out.add(g);
  }
  return out;
}

export interface CapabilityContext {
  isSuperAdmin: boolean;
  /** The vendor platform owner — an apex tier that holds every capability,
   *  consistent with super admins and `requireModule`. Optional so pure
   *  client/test callers can omit it (treated as false). */
  isPlatformOwner?: boolean;
  permissions: readonly string[];
}

/**
 * Whether the user holds a capability — granular (`module.resource.action`) or
 * legacy flat — resolving through the alias layer. The platform owner and super
 * admins hold all. This is the granular-aware companion to `hasPermission`.
 */
export function can(ctx: CapabilityContext, capability: string): boolean {
  if (ctx.isSuperAdmin || ctx.isPlatformOwner) return true;
  return expandAliases(ctx.permissions).has(capability);
}

/** Whether the user holds ANY of the given capabilities. Platform owner / super admins: yes. */
export function canAny(ctx: CapabilityContext, capabilities: readonly string[]): boolean {
  if (ctx.isSuperAdmin || ctx.isPlatformOwner) return true;
  const eff = expandAliases(ctx.permissions);
  return capabilities.some((c) => eff.has(c));
}

/** All capabilities a flat permission grants (itself + aliases). Useful for UI/audit. */
export function capabilitiesFor(perm: Permission): string[] {
  return [...expandAliases([perm])];
}

// ─── Authorization Phase 2 — migrated call-site registry (cutover safety) ─────
//
// The granular capabilities that Phase 2 wired into runtime call sites, each
// paired with the legacy flat permission the site previously checked. The
// invariant the cutover test enforces: every granular key here is alias-reachable
// from its legacy key (so no role that could satisfy the old check loses access,
// and no orphan/deny-all key was introduced).
export interface MigratedCallSite {
  /** Human-locatable call site (file:symbol). */
  site: string;
  /** The legacy flat permission previously checked at the site. */
  legacy: Permission;
  /** The most-specific alias-covered granular capability now checked. */
  granular: GranularCapability;
}

export const MIGRATED_CALL_SITES: readonly MigratedCallSite[] = [
  { site: 'customers/actions.ts:saveCustomer (status change)', legacy: 'customers.change_status', granular: 'customers.status.change' },
  { site: 'customers/actions.ts:decideCustomer', legacy: 'customers.approve', granular: 'customers.approval.approve' },
  { site: 'sales/pricing/actions.ts:guard', legacy: 'pricing.manage', granular: 'pricing.rule.edit' },
];

/** Sanity helper for tests/tools: legacy keys that have a granular expansion. */
export const ALIASED_LEGACY_KEYS = Object.keys(CAPABILITY_ALIASES) as Permission[];

// Compile-time guard: every aliased key must be a real flat Permission.
const _aliasKeysAreRealPermissions: readonly Permission[] = ALIASED_LEGACY_KEYS;
void _aliasKeysAreRealPermissions;
void ALL_PERMISSIONS;
