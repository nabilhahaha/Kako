import type { GranularCapability } from './capabilities';
import type { BranchRole } from './types';

/**
 * Authorization Phase 6 (P6) — the net-new finer capabilities.
 *
 * These eight capabilities are intentionally NOT produced by any legacy alias
 * (see CAPABILITY_ALIASES in capabilities.ts) and are NOT in ALL_PERMISSIONS, so
 * they are deny-all until explicitly granted. P6 makes them grantable in the
 * Authz Console and seeds a least-privilege, role-based default matrix.
 *
 * Stored exactly like flat permissions — a (role_key, permission) row in
 * erp_role_permissions / erp_company_role_permissions — so the existing grant
 * plumbing and can()/expandAliases() resolution work unchanged.
 */
export const DENY_ALL_CAPABILITIES = [
  'customers.delete',
  'sales.price.override',
  'sales.payment.writeoff',
  'purchasing.po.approve',
  'inventory.adjustment.approve',
  'sales.order.cancel',
  'sales.invoice.cancel',
  'accounting.voucher.approve',
] as const satisfies readonly GranularCapability[];

export type DenyAllCapability = (typeof DENY_ALL_CAPABILITIES)[number];

export function isDenyAllCapability(key: string): key is DenyAllCapability {
  return (DENY_ALL_CAPABILITIES as readonly string[]).includes(key);
}

/** Bilingual labels + group for each net-new capability (mirrors the shape of
 *  PERMISSION_LABELS so the Authz Console renders them the same way). The `risk`
 *  flag drives the "sensitive action" styling in the matrix. */
export const GRANULAR_CAPABILITY_LABELS: Record<
  DenyAllCapability,
  { en: string; ar: string; group: string; risk: 'high' | 'elevated' }
> = {
  'customers.delete': { en: 'Delete customers', ar: 'حذف العملاء', group: 'sales', risk: 'high' },
  'sales.price.override': { en: 'Override prices', ar: 'تجاوز الأسعار', group: 'sales', risk: 'elevated' },
  'sales.payment.writeoff': { en: 'Write off payments', ar: 'إعدام/شطب المدفوعات', group: 'accounting', risk: 'high' },
  'purchasing.po.approve': { en: 'Approve purchase orders', ar: 'اعتماد أوامر الشراء', group: 'purchasing', risk: 'elevated' },
  'inventory.adjustment.approve': { en: 'Approve stock adjustments', ar: 'اعتماد تسويات المخزون', group: 'inventory', risk: 'elevated' },
  'sales.order.cancel': { en: 'Cancel sales orders', ar: 'إلغاء أوامر البيع', group: 'sales', risk: 'elevated' },
  'sales.invoice.cancel': { en: 'Cancel invoices', ar: 'إلغاء الفواتير', group: 'sales', risk: 'high' },
  'accounting.voucher.approve': { en: 'Approve vouchers', ar: 'اعتماد السندات', group: 'accounting', risk: 'elevated' },
};

/**
 * Least-privilege, role-based DEFAULT grant matrix (P6).
 *
 * Principle (per product direction): least privilege, role-based ownership — NOT
 * "grant everything to every manager". The Company Admin (owner) holds all eight;
 * every other role receives ONLY the capabilities it functionally owns. The
 * generic `manager` role is deliberately NOT granted any (admins delegate
 * explicitly via the console). Role substitutions where no dedicated role exists:
 * Finance Manager → accountant; Purchasing Manager → branch_manager (branch
 * operational owner); Warehouse Manager → warehouse_keeper.
 */
export const DEFAULT_CAPABILITY_GRANTS: Partial<Record<BranchRole, readonly DenyAllCapability[]>> = {
  // Company Admin (tenant owner): all eight, incl. the admin-only ones.
  admin: [...DENY_ALL_CAPABILITIES],
  // Finance: write-offs, invoice cancellation, voucher approval.
  accountant: ['sales.payment.writeoff', 'sales.invoice.cancel', 'accounting.voucher.approve'],
  // Branch operations: order cancellation + PO approval (Purchasing Manager proxy).
  branch_manager: ['sales.order.cancel', 'purchasing.po.approve'],
  // Warehouse: stock-adjustment approval.
  warehouse_keeper: ['inventory.adjustment.approve'],
  // Sales leadership: price overrides.
  sales_director: ['sales.price.override'],
  regional_manager: ['sales.price.override'],
};

/** Flatten the default matrix into (role_key, permission) pairs — mirrors the
 *  rows seeded into erp_role_permissions by migration 0124. */
export function defaultCapabilityGrantPairs(): Array<{ roleKey: BranchRole; capability: DenyAllCapability }> {
  const pairs: Array<{ roleKey: BranchRole; capability: DenyAllCapability }> = [];
  for (const [roleKey, caps] of Object.entries(DEFAULT_CAPABILITY_GRANTS)) {
    for (const capability of caps ?? []) pairs.push({ roleKey: roleKey as BranchRole, capability });
  }
  return pairs;
}
