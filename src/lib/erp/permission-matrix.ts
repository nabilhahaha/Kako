import type { SupabaseClient } from '@supabase/supabase-js';

/** ── Role & Permission Matrix (Platform Foundation #2) ─────────────────────
 *  Action-typed, module-level permissions as a decoupled layer that coexists
 *  with the legacy permission keys. Keys are `resource:action`. The DB is the
 *  source of truth (erp_permission_catalog + erp_matrix_role_permissions +
 *  erp_matrix_has), with company-override-else-global resolution; this module
 *  mirrors the catalog for the UI and exposes a server-side check. */

export const PERM_ACTIONS = ['view', 'create', 'edit', 'approve', 'export', 'delete'] as const;
export type PermAction = (typeof PERM_ACTIONS)[number];

export interface MatrixResource {
  actions: PermAction[];
  module: string;
  en: string;
  ar: string;
}

/** Mirrors the seeded erp_permission_catalog. Future industry packs add
 *  resources here (FMCG/Medical/HR/…) — the resolver/DB need no change. */
export const PERM_MATRIX: Record<string, MatrixResource> = {
  customers:  { actions: ['view', 'create', 'edit', 'approve', 'export', 'delete'], module: 'crm',         en: 'Customers',  ar: 'العملاء' },
  products:   { actions: ['view', 'create', 'edit', 'export', 'delete'],            module: 'inventory',   en: 'Products',   ar: 'المنتجات' },
  inventory:  { actions: ['view', 'edit', 'approve', 'export'],                     module: 'inventory',   en: 'Inventory',  ar: 'المخزون' },
  sales:      { actions: ['view', 'create', 'edit', 'approve', 'export', 'delete'], module: 'sales',       en: 'Sales',      ar: 'المبيعات' },
  suppliers:  { actions: ['view', 'create', 'edit', 'export', 'delete'],            module: 'purchasing',  en: 'Suppliers',  ar: 'الموردون' },
  purchasing: { actions: ['view', 'create', 'edit', 'approve', 'export'],           module: 'purchasing',  en: 'Purchasing', ar: 'المشتريات' },
  accounting: { actions: ['view', 'create', 'export'],                             module: 'accounting',  en: 'Accounting', ar: 'المحاسبة' },
  routes:     { actions: ['view', 'create', 'edit', 'delete'],                     module: 'distribution',en: 'Routes',     ar: 'خطوط السير' },
  requests:   { actions: ['view', 'approve'],                                      module: 'workflow',    en: 'Requests',   ar: 'الطلبات' },
  reports:    { actions: ['view', 'export'],                                       module: 'analytics',   en: 'Reports',    ar: 'التقارير' },
};

export type MatrixKey = string; // `${resource}:${action}`

export const ALL_MATRIX_KEYS: MatrixKey[] = Object.entries(PERM_MATRIX).flatMap(
  ([resource, def]) => def.actions.map((a) => `${resource}:${a}`),
);

/** Server-side matrix check via the SQL resolver (company-override-else-global,
 *  with super-admin / platform-owner / company-admin short-circuits + RLS). */
export async function canMatrix(
  supabase: SupabaseClient,
  resource: string,
  action: PermAction,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('erp_matrix_has', { p_resource: resource, p_action: action });
  return !error && data === true;
}

/** Pure helper for rendering a granted set in the UI, given the user's keys. */
export function canFromKeys(keys: string[], resource: string, action: PermAction): boolean {
  return keys.includes(`${resource}:${action}`);
}
