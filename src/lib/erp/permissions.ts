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
  | 'integrations.manage' // data import, API keys, webhooks, sync (Data Integration Layer)
  | 'settings.custom_fields' // define custom fields per entity (Custom Fields Engine)
  | 'reports.view'
  | 'hotel.manage' // rooms & bookings (hotel / furnished apartments)
  | 'clinic.manage' // full clinic access (admin/manager) — implies reception + doctor
  | 'clinic.reception' // reception desk: appointments, registration, billing
  | 'clinic.doctor' // doctor: queue, exam, prescriptions, patient file
  | 'restaurant.manage' // tables, orders, kitchen, checkout (restaurant / café)
  | 'salon.manage' // services, bookings, tickets, checkout (salon / barber)
  | 'pharmacy.dispense' // prescription / controlled-drug dispensing register
  | 'laundry.manage' // laundry orders, wash workflow, checkout
  | 'market.pos' // supermarket fast cashier (walk-in checkout)
  | 'wholesale.pricing' // wholesale price tiers + per-customer pricing
  | 'field.sales'; // rep app, daily settlement, visit planning (field roles only)

export const PERMISSION_LABELS: Record<Permission, { en: string; ar: string; group: string }> = {
  'sales.sell': { en: 'Selling (invoices/orders/POS)', ar: 'البيع (فواتير/أوامر/نقطة بيع)', group: 'sales' },
  'sales.discount': { en: 'Grant discounts', ar: 'منح خصومات', group: 'sales' },
  'sales.collect': { en: 'Collect from customers', ar: 'تحصيل من العملاء', group: 'sales' },
  'sales.return': { en: 'Sales returns', ar: 'مرتجعات المبيعات', group: 'sales' },
  'customers.manage': { en: 'Manage customers', ar: 'إدارة العملاء', group: 'sales' },
  'inventory.view': { en: 'View stock balances', ar: 'عرض أرصدة المخزون', group: 'inventory' },
  'inventory.adjust': { en: 'Adjust inventory', ar: 'تسوية المخزون', group: 'inventory' },
  'inventory.transfer': { en: 'Transfer between warehouses', ar: 'التحويل بين المخازن', group: 'inventory' },
  'inventory.count': { en: 'Monthly stocktake', ar: 'الجرد الشهري', group: 'inventory' },
  'stock_request.create': { en: 'Request stock loading', ar: 'طلب تحميل بضاعة', group: 'inventory' },
  'stock_request.approve': { en: 'Approve loading requests', ar: 'اعتماد طلبات التحميل', group: 'inventory' },
  'purchasing.manage': { en: 'Purchasing and receiving', ar: 'المشتريات والاستلام', group: 'purchasing' },
  'suppliers.manage': { en: 'Suppliers and settlement', ar: 'الموردين والسداد', group: 'purchasing' },
  'accounting.view': { en: 'View accounts and reports', ar: 'عرض الحسابات والتقارير', group: 'accounting' },
  'accounting.post': { en: 'Post journals and vouchers', ar: 'ترحيل القيود والسندات', group: 'accounting' },
  'reports.view': { en: 'Reports', ar: 'التقارير', group: 'accounting' },
  'settings.branches': { en: 'Manage branches', ar: 'إدارة الفروع', group: 'settings' },
  'settings.users': { en: 'Manage users and permissions', ar: 'إدارة المستخدمين والصلاحيات', group: 'settings' },
  'integrations.manage': { en: 'Manage data import & integrations', ar: 'إدارة استيراد البيانات والتكاملات', group: 'settings' },
  'settings.custom_fields': { en: 'Manage custom fields', ar: 'إدارة الحقول المخصصة', group: 'settings' },
  'hotel.manage': { en: 'Manage rooms and bookings', ar: 'إدارة الغرف والحجوزات', group: 'hotel' },
  'clinic.manage': { en: 'Full clinic management', ar: 'إدارة العيادة بالكامل', group: 'clinic' },
  'clinic.reception': { en: 'Reception (appointments/registration/billing)', ar: 'الاستقبال (مواعيد/تسجيل/تحصيل)', group: 'clinic' },
  'clinic.doctor': { en: 'Doctor (exam/diagnosis/prescription)', ar: 'الطبيب (كشف/تشخيص/روشتة)', group: 'clinic' },
  'restaurant.manage': { en: 'Restaurant/café management (tables/orders/kitchen)', ar: 'إدارة المطعم/الكافيه (طاولات/أوردرات/مطبخ)', group: 'restaurant' },
  'salon.manage': { en: 'Salon management (services/appointments/tickets)', ar: 'إدارة الصالون (خدمات/مواعيد/تذاكر)', group: 'salon' },
  'pharmacy.dispense': { en: 'Drug dispensing and prescriptions register', ar: 'سجل صرف الأدوية والروشتات', group: 'pharmacy' },
  'laundry.manage': { en: 'Laundry management (orders/washing/delivery)', ar: 'إدارة المغسلة (طلبات/غسيل/تسليم)', group: 'laundry' },
  'market.pos': { en: 'Fast cashier (supermarket)', ar: 'الكاشير السريع (سوبر ماركت)', group: 'market' },
  'wholesale.pricing': { en: 'Tiered wholesale pricing', ar: 'أسعار الجملة بالمستويات', group: 'wholesale' },
  'field.sales': { en: 'Field sales (rep app)', ar: 'المبيعات الميدانية (تطبيق المندوب)', group: 'sales' },
};

/** Bilingual labels for permission group slugs (used as section headers). */
export const PERMISSION_GROUP_LABELS: Record<string, { en: string; ar: string }> = {
  sales: { en: 'Sales', ar: 'المبيعات' },
  inventory: { en: 'Inventory', ar: 'المخزون' },
  purchasing: { en: 'Purchasing', ar: 'المشتريات' },
  accounting: { en: 'Accounting', ar: 'الحسابات' },
  settings: { en: 'Settings', ar: 'الإعدادات' },
  hotel: { en: 'Hotel', ar: 'الفندق' },
  clinic: { en: 'Clinic', ar: 'العيادة' },
  restaurant: { en: 'Restaurant', ar: 'المطعم' },
  salon: { en: 'Salon', ar: 'الصالون' },
  pharmacy: { en: 'Pharmacy', ar: 'الصيدلية' },
  laundry: { en: 'Laundry', ar: 'المغسلة' },
  market: { en: 'Supermarket', ar: 'السوبر ماركت' },
  wholesale: { en: 'Wholesale', ar: 'الجملة' },
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
  cashier: ['sales.sell', 'sales.collect', 'customers.manage', 'restaurant.manage', 'pharmacy.dispense', 'laundry.manage', 'market.pos'],
  salesman: [
    'sales.sell', 'sales.collect', 'customers.manage',
    'inventory.view', 'stock_request.create', 'field.sales',
  ],
  driver: [
    'sales.sell', 'sales.collect', 'customers.manage',
    'inventory.view', 'stock_request.create', 'field.sales',
  ],
  technician: [
    'customers.manage', 'sales.sell', 'inventory.view', 'stock_request.create',
  ],
  doctor: ['clinic.doctor', 'reports.view'],
  receptionist: ['clinic.reception', 'customers.manage', 'sales.sell', 'sales.collect'],
  stylist: ['customers.manage', 'sales.sell', 'salon.manage'],
  housekeeping: ['hotel.manage'],
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
