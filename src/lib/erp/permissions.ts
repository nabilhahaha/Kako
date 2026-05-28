import type { BranchRole } from './types';

// ─── Permission keys ──────────────────────────────────────────────────────
// Granular capabilities, grouped by area. Roles are granted a set of these.
export type Permission =
  | 'sales.sell' // create orders/invoices, POS, rep app
  | 'sales.discount' // apply line discounts
  | 'sales.collect' // record customer payments
  | 'sales.return' // create/approve sales returns
  | 'customers.manage'
  | 'inventory.view'
  | 'inventory.adjust' // manual stock adjustments / stocktake
  | 'inventory.transfer' // move stock between warehouses
  | 'inventory.count' // perform monthly physical counts
  | 'stock_request.create' // rep requests stock from a warehouse
  | 'stock_request.approve' // warehouse keeper / manager approves & loads
  | 'purchasing.manage' // POs, receiving
  | 'suppliers.manage' // suppliers + settlements
  | 'accounting.view' // chart, journal, reports
  | 'accounting.post' // post vouchers / journals
  | 'settings.branches' // company & branches
  | 'settings.users' // users, roles, hierarchy
  | 'reports.view';

export const PERMISSION_LABELS: Record<Permission, { ar: string; group: string }> = {
  'sales.sell': { ar: 'البيع (فواتير/أوامر/نقطة بيع)', group: 'المبيعات' },
  'sales.discount': { ar: 'منح خصومات', group: 'المبيعات' },
  'sales.collect': { ar: 'تحصيل من العملاء', group: 'المبيعات' },
  'sales.return': { ar: 'مرتجعات المبيعات', group: 'المبيعات' },
  'customers.manage': { ar: 'إدارة العملاء', group: 'المبيعات' },
  'inventory.view': { ar: 'عرض أرصدة المخزون', group: 'المخزون' },
  'inventory.adjust': { ar: 'تسوية المخزون', group: 'المخزون' },
  'inventory.transfer': { ar: 'التحويل بين المخازن', group: 'المخزون' },
  'inventory.count': { ar: 'الجرد الشهري', group: 'المخزون' },
  'stock_request.create': { ar: 'طلب تحميل بضاعة', group: 'المخزون' },
  'stock_request.approve': { ar: 'اعتماد طلبات التحميل', group: 'المخزون' },
  'purchasing.manage': { ar: 'المشتريات والاستلام', group: 'المشتريات' },
  'suppliers.manage': { ar: 'الموردين والسداد', group: 'المشتريات' },
  'accounting.view': { ar: 'عرض الحسابات والتقارير', group: 'الحسابات' },
  'accounting.post': { ar: 'ترحيل القيود والسندات', group: 'الحسابات' },
  'reports.view': { ar: 'التقارير', group: 'الحسابات' },
  'settings.branches': { ar: 'إدارة الفروع', group: 'الإعدادات' },
  'settings.users': { ar: 'إدارة المستخدمين والصلاحيات', group: 'الإعدادات' },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

// ─── Default permissions per role ───────────────────────────────────────────
// admin gets everything ('*'). Others get a tailored set.
const ALL = '*' as const;

export const ROLE_PERMISSIONS: Record<BranchRole, Permission[] | typeof ALL> = {
  admin: ALL,
  manager: ALL,
  supervisor: [
    'sales.sell', 'sales.discount', 'sales.collect', 'sales.return',
    'customers.manage', 'inventory.view', 'stock_request.approve', 'reports.view',
  ],
  accountant: [
    'accounting.view', 'accounting.post', 'reports.view',
    'suppliers.manage', 'sales.collect',
  ],
  cashier: ['sales.sell', 'sales.collect', 'customers.manage'],
  salesman: [
    'sales.sell', 'sales.collect', 'customers.manage',
    'inventory.view', 'stock_request.create',
  ],
  warehouse_keeper: [
    'inventory.view', 'inventory.adjust', 'inventory.transfer',
    'inventory.count', 'stock_request.approve', 'purchasing.manage',
  ],
  staff: ['inventory.view'],
  viewer: ['reports.view', 'accounting.view', 'inventory.view'],
};

export interface PermissionContext {
  isSuperAdmin: boolean;
  permissions: Permission[];
}

/** Whether the user holds a permission. Super admins hold all. */
export function hasPermission(ctx: PermissionContext, perm: Permission): boolean {
  return ctx.isSuperAdmin || ctx.permissions.includes(perm);
}

/** Whether the user holds ANY of the given permissions (super admins: yes). */
export function hasAnyPermission(ctx: PermissionContext, perms: Permission[]): boolean {
  return ctx.isSuperAdmin || perms.some((p) => ctx.permissions.includes(p));
}

/** Resolve the concrete permission list for a role (expands '*'). */
export function permissionsForRole(role: BranchRole): Permission[] {
  const set = ROLE_PERMISSIONS[role];
  return set === ALL ? [...ALL_PERMISSIONS] : set;
}
