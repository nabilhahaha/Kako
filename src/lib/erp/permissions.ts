import type { BranchRole } from './types';

// ─── Permission keys ──────────────────────────────────────────────────────
// Granular capabilities, grouped by area. Roles are granted a set of these.
export type Permission =
  | 'sales.sell' // create orders/invoices, POS, rep app
  | 'sales.discount' // apply line discounts
  | 'sales.collect' // record customer payments
  | 'sales.return' // create/approve sales returns
  | 'customers.manage'
  | 'customers.approve' // approve/reject customer onboarding + sensitive change requests
  | 'customers.change_status' // suspend / block / activate customers (FP-CS)
  | 'inventory.view'
  | 'inventory.adjust' // manual stock adjustments / stocktake
  | 'inventory.transfer' // move stock between warehouses
  | 'inventory.count' // perform monthly physical counts
  | 'stock_request.create' // rep requests stock from a warehouse
  | 'stock_request.approve' // warehouse keeper / manager approves & loads
  | 'purchasing.manage' // POs, receiving
  | 'purchasing.return' // supplier (purchase) returns
  | 'suppliers.manage' // suppliers + settlements
  | 'accounting.view' // chart, journal, reports
  | 'accounting.post' // post vouchers / journals
  | 'settings.branches' // company & branches
  | 'settings.users' // users, roles, hierarchy
  | 'integrations.manage' // data import, API keys, webhooks, sync (Data Integration Layer)
  | 'settings.custom_fields' // define custom fields per entity (Custom Fields Engine)
  | 'workflow.manage' // define approval workflows (Workflow / Approval Engine)
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
  | 'pricing.manage' // Pricing engine: price rules + effective dates + history (Pricing module)
  | 'electrical.rma' // RMA / serial / warranty management (Electrical pack)
  | 'field.sales' // rep app, daily settlement, visit planning (field roles only)
  | 'field.attach_media' // attach photos/media to a visit/customer from the field (offline-capable)
  // ── FMCG operations — granular flat permission keys (S5) ──
  | 'customer.create' // create a new customer (rep/field onboarding)
  | 'customer.import' // bulk-import customers
  | 'customer.transfer' // reassign customer ownership (route/salesman/branch)
  | 'customer.edit' // edit customer master data
  | 'product.create' // create a new product
  | 'product.import' // bulk-import products
  | 'stock.view' // view van/warehouse stock balances
  | 'stock.adjust' // adjust stock (van/warehouse)
  | 'stock.transfer' // initiate a stock transfer
  | 'stock.transfer.approve' // approve a stock transfer
  | 'user.import' // bulk-import users (onboarding)
  | 'user.transfer' // reassign user (branch/team/reporting line)
  | 'route.create' // create a route
  | 'route.import' // bulk-import routes
  | 'journey.create' // create a journey plan
  | 'journey.import' // bulk-import journey plans
  | 'visit.override_gps' // record a visit outside the allowed GPS radius
  | 'visit.approve_out_of_route' // approve an out-of-route visit
  | 'day.close' // close the working day (rep)
  | 'day.approve_close_exception' // approve a day-close exception
  | 'day.reopen.request' // request to reopen a closed day (rep) — governed workflow
  | 'day.reopen.approve' // approve/reject a day-reopen request (supervisor/admin)
  | 'day.reopen.override' // approve a reopen past the settlement/accounting lock (Phase 2/3)
  | 'cash.handover.request' // declare a cash handover to the office/cashier (rep)
  | 'cash.handover.confirm' // confirm/reject a cash-handover request (cashier/supervisor)
  | 'customer.request' // raise a governed customer request (new / data update / GPS) — rep
  | 'customer.request.approve' // approve/reject a customer request + apply it (supervisor/admin)
  // ── FMCG Value Acceleration Wave 1 ──
  | 'product.search' // search the product catalogue (paginated, tenant-safe)
  | 'pricing.view' // view price lists / resolved prices
  | 'uom.manage' // manage product units of measure + conversions
  | 'target.view' // view targets & achievement
  | 'target.manage' // create/import targets
  | 'reconciliation.view' // view van reconciliations
  | 'reconciliation.manage' // compute/record van reconciliation
  | 'reconciliation.approve' // settle/approve a van reconciliation
  | 'return.reason.manage' // manage the return-reason catalogue
  | 'credit.request.create' // request a customer credit-limit change
  | 'credit.request.approve' // approve a credit-limit request
  // ── Retail Execution Core (assortment / surveys) ──
  | 'assortment.manage' // manage must-stock lists (MSL)
  | 'survey.manage' // build in-store surveys
  | 'grade.manage' // manage outlet grading (bands, weights, recompute)
  | 'report.aggregate.view' // view scale-safe aggregated reports
  // ── Fashion Store pack (clothing vertical) ──
  | 'fashion.manage' // full fashion-store management (owner) — implies all below
  | 'fashion.sell' // POS cash + installment sales, customers, returns
  | 'fashion.inventory' // styles/variants, stock in/out, transfers, counts, labels
  | 'fashion.purchase' // suppliers, purchases (cash/credit), supplier payments
  | 'fashion.installments' // installment plans, schedules, collections, statement
  | 'fashion.cashbox' // open/close cash box, record expenses
  | 'fashion.reports'; // fashion sales / inventory / profit / balances reports

export const PERMISSION_LABELS: Record<Permission, { en: string; ar: string; group: string }> = {
  'sales.sell': { en: 'Selling (invoices/orders/POS)', ar: 'البيع (فواتير/أوامر/نقطة بيع)', group: 'sales' },
  'sales.discount': { en: 'Grant discounts', ar: 'منح خصومات', group: 'sales' },
  'sales.collect': { en: 'Collect from customers', ar: 'تحصيل من العملاء', group: 'sales' },
  'sales.return': { en: 'Sales returns', ar: 'مرتجعات المبيعات', group: 'sales' },
  'customers.manage': { en: 'Manage customers', ar: 'إدارة العملاء', group: 'sales' },
  'customers.approve': { en: 'Approve customers & changes', ar: 'اعتماد العملاء والتعديلات', group: 'sales' },
  'customers.change_status': { en: 'Suspend / block customers', ar: 'إيقاف / حظر العملاء', group: 'sales' },
  'inventory.view': { en: 'View stock balances', ar: 'عرض أرصدة المخزون', group: 'inventory' },
  'inventory.adjust': { en: 'Adjust inventory', ar: 'تسوية المخزون', group: 'inventory' },
  'inventory.transfer': { en: 'Transfer between warehouses', ar: 'التحويل بين المخازن', group: 'inventory' },
  'inventory.count': { en: 'Monthly stocktake', ar: 'الجرد الشهري', group: 'inventory' },
  'stock_request.create': { en: 'Request stock loading', ar: 'طلب تحميل بضاعة', group: 'inventory' },
  'stock_request.approve': { en: 'Approve loading requests', ar: 'اعتماد طلبات التحميل', group: 'inventory' },
  'purchasing.manage': { en: 'Purchasing and receiving', ar: 'المشتريات والاستلام', group: 'purchasing' },
  'purchasing.return': { en: 'Supplier returns', ar: 'مرتجعات المشتريات', group: 'purchasing' },
  'suppliers.manage': { en: 'Suppliers and settlement', ar: 'الموردين والسداد', group: 'purchasing' },
  'accounting.view': { en: 'View accounts and reports', ar: 'عرض الحسابات والتقارير', group: 'accounting' },
  'accounting.post': { en: 'Post journals and vouchers', ar: 'ترحيل القيود والسندات', group: 'accounting' },
  'reports.view': { en: 'Reports', ar: 'التقارير', group: 'accounting' },
  'settings.branches': { en: 'Manage branches', ar: 'إدارة الفروع', group: 'settings' },
  'settings.users': { en: 'Manage users and permissions', ar: 'إدارة المستخدمين والصلاحيات', group: 'settings' },
  'integrations.manage': { en: 'Manage data import & integrations', ar: 'إدارة استيراد البيانات والتكاملات', group: 'settings' },
  'settings.custom_fields': { en: 'Manage custom fields', ar: 'إدارة الحقول المخصصة', group: 'settings' },
  'workflow.manage': { en: 'Manage approval workflows', ar: 'إدارة مسارات الموافقات', group: 'settings' },
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
  'pricing.manage': { en: 'Manage pricing (rules, lists, effective dates)', ar: 'إدارة التسعير (قواعد، قوائم، تواريخ السريان)', group: 'sales' },
  'electrical.rma': { en: 'Serials, warranty & RMA', ar: 'الأرقام التسلسلية والضمان والإرجاع', group: 'electrical' },
  'field.sales': { en: 'Field sales (rep app)', ar: 'المبيعات الميدانية (تطبيق المندوب)', group: 'sales' },
  'field.attach_media': { en: 'Attach field media (photos)', ar: 'إرفاق صور ميدانية', group: 'sales' },
  // ── FMCG operations — granular flat permission keys (S5) ──
  'customer.create': { en: 'Create customers', ar: 'إنشاء عملاء', group: 'sales' },
  'customer.import': { en: 'Import customers', ar: 'استيراد العملاء', group: 'sales' },
  'customer.transfer': { en: 'Transfer customer ownership', ar: 'نقل ملكية العملاء', group: 'sales' },
  'customer.edit': { en: 'Edit customers', ar: 'تعديل العملاء', group: 'sales' },
  'product.create': { en: 'Create products', ar: 'إنشاء منتجات', group: 'inventory' },
  'product.import': { en: 'Import products', ar: 'استيراد المنتجات', group: 'inventory' },
  'stock.view': { en: 'View stock', ar: 'عرض المخزون', group: 'inventory' },
  'stock.adjust': { en: 'Adjust stock', ar: 'تسوية المخزون', group: 'inventory' },
  'stock.transfer': { en: 'Transfer stock', ar: 'تحويل المخزون', group: 'inventory' },
  'stock.transfer.approve': { en: 'Approve stock transfers', ar: 'اعتماد تحويلات المخزون', group: 'inventory' },
  'user.import': { en: 'Import users', ar: 'استيراد المستخدمين', group: 'settings' },
  'user.transfer': { en: 'Transfer users', ar: 'نقل المستخدمين', group: 'settings' },
  'route.create': { en: 'Create routes', ar: 'إنشاء خطوط السير', group: 'settings' },
  'route.import': { en: 'Import routes', ar: 'استيراد خطوط السير', group: 'settings' },
  'journey.create': { en: 'Create journey plans', ar: 'إنشاء خطط الزيارات', group: 'settings' },
  'journey.import': { en: 'Import journey plans', ar: 'استيراد خطط الزيارات', group: 'settings' },
  'visit.override_gps': { en: 'Override visit GPS radius', ar: 'تجاوز نطاق GPS للزيارة', group: 'field_ops' },
  'visit.approve_out_of_route': { en: 'Approve out-of-route visits', ar: 'اعتماد الزيارات خارج خط السير', group: 'field_ops' },
  'day.close': { en: 'Close the working day', ar: 'إغلاق يوم العمل', group: 'field_ops' },
  'day.approve_close_exception': { en: 'Approve day-close exceptions', ar: 'اعتماد استثناءات إغلاق اليوم', group: 'field_ops' },
  'day.reopen.request': { en: 'Request to reopen a closed day', ar: 'طلب إعادة فتح يوم مُغلق', group: 'field_ops' },
  'day.reopen.approve': { en: 'Approve day-reopen requests', ar: 'اعتماد طلبات إعادة فتح اليوم', group: 'field_ops' },
  'day.reopen.override': { en: 'Override settlement lock on reopen', ar: 'تجاوز قفل التسوية عند إعادة الفتح', group: 'field_ops' },
  'cash.handover.request': { en: 'Request a cash handover', ar: 'طلب تسليم نقدية', group: 'field_ops' },
  'cash.handover.confirm': { en: 'Confirm cash handovers', ar: 'تأكيد تسليم النقدية', group: 'field_ops' },
  'customer.request': { en: 'Raise customer requests', ar: 'تقديم طلبات العملاء', group: 'sales' },
  'customer.request.approve': { en: 'Approve customer requests', ar: 'اعتماد طلبات العملاء', group: 'sales' },
  // ── FMCG Value Acceleration Wave 1 ──
  'product.search': { en: 'Search products', ar: 'البحث عن المنتجات', group: 'inventory' },
  'pricing.view': { en: 'View pricing', ar: 'عرض التسعير', group: 'sales' },
  'uom.manage': { en: 'Manage units of measure', ar: 'إدارة وحدات القياس', group: 'inventory' },
  'target.view': { en: 'View targets & achievement', ar: 'عرض الأهداف والإنجاز', group: 'field_ops' },
  'target.manage': { en: 'Manage targets', ar: 'إدارة الأهداف', group: 'field_ops' },
  'reconciliation.view': { en: 'View van reconciliation', ar: 'عرض تسوية العربة', group: 'inventory' },
  'reconciliation.manage': { en: 'Run van reconciliation', ar: 'تنفيذ تسوية العربة', group: 'inventory' },
  'reconciliation.approve': { en: 'Approve van reconciliation', ar: 'اعتماد تسوية العربة', group: 'inventory' },
  'return.reason.manage': { en: 'Manage return reasons', ar: 'إدارة أسباب المرتجعات', group: 'sales' },
  'credit.request.create': { en: 'Request credit-limit change', ar: 'طلب تغيير حد الائتمان', group: 'accounting' },
  'credit.request.approve': { en: 'Approve credit-limit requests', ar: 'اعتماد طلبات حد الائتمان', group: 'accounting' },
  'assortment.manage': { en: 'Manage assortment / MSL', ar: 'إدارة التشكيلة / القائمة الإلزامية', group: 'field_ops' },
  'survey.manage': { en: 'Build in-store surveys', ar: 'إنشاء استبيانات نقاط البيع', group: 'field_ops' },
  'grade.manage': { en: 'Manage outlet grading', ar: 'إدارة تصنيف العملاء', group: 'field_ops' },
  'report.aggregate.view': { en: 'View aggregated reports', ar: 'عرض التقارير المجمّعة', group: 'accounting' },
  // ── Fashion Store pack ──
  'fashion.manage': { en: 'Fashion store management', ar: 'إدارة متجر الملابس', group: 'fashion' },
  'fashion.sell': { en: 'Fashion sales (POS / installments)', ar: 'مبيعات المتجر (كاشير / تقسيط)', group: 'fashion' },
  'fashion.inventory': { en: 'Fashion products & inventory', ar: 'منتجات ومخزون المتجر', group: 'fashion' },
  'fashion.purchase': { en: 'Fashion suppliers & purchases', ar: 'موردو ومشتريات المتجر', group: 'fashion' },
  'fashion.installments': { en: 'Installment plans & collection', ar: 'خطط التقسيط والتحصيل', group: 'fashion' },
  'fashion.cashbox': { en: 'Cash box & expenses', ar: 'الصندوق والمصروفات', group: 'fashion' },
  'fashion.reports': { en: 'Fashion reports', ar: 'تقارير المتجر', group: 'fashion' },
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
  electrical: { en: 'Electrical', ar: 'الكهربائيات' },
  field_ops: { en: 'Field Operations', ar: 'العمليات الميدانية' },
  fashion: { en: 'Fashion Store', ar: 'متجر الملابس' },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

// ─── Default permissions per role ───────────────────────────────────────────
// admin gets everything ('*'). Others get a tailored set.
const ALL = '*' as const;

export const ROLE_PERMISSIONS: Record<BranchRole, Permission[] | typeof ALL> = {
  admin: ALL,
  manager: ALL,
  // ── FMCG sales hierarchy (S2) — role layer only; scope/visibility is S4 ──
  // Sales Director / NSM: full commercial visibility (no company settings/billing).
  sales_director: [
    'sales.sell', 'sales.discount', 'sales.collect', 'sales.return',
    'customers.manage', 'customers.change_status', 'inventory.view', 'reports.view', 'accounting.view',
    'stock_request.approve', 'pricing.manage', 'settings.custom_fields', 'integrations.manage',
    'customer.transfer', 'route.create', 'journey.create', 'stock.view',
    'assortment.manage', 'survey.manage', 'target.view',
  ],
  national_sales_manager: [
    'sales.sell', 'sales.discount', 'sales.collect', 'sales.return',
    'customers.manage', 'customers.change_status', 'inventory.view', 'reports.view', 'accounting.view',
    'stock_request.approve', 'pricing.manage', 'settings.custom_fields', 'integrations.manage',
    'customer.transfer', 'route.create', 'journey.create', 'stock.view',
    'assortment.manage', 'survey.manage', 'target.view',
  ],
  // Regional / Area: commercial management (no finance posting / settings).
  regional_manager: [
    'sales.sell', 'sales.discount', 'sales.collect', 'sales.return',
    'customers.manage', 'customers.change_status', 'inventory.view', 'reports.view', 'stock_request.approve',
    'customer.transfer', 'journey.create', 'route.create', 'stock.view',
  ],
  area_manager: [
    'sales.sell', 'sales.discount', 'sales.collect', 'sales.return',
    'customers.manage', 'customers.change_status', 'inventory.view', 'reports.view', 'stock_request.approve',
    'customer.transfer', 'journey.create', 'route.create', 'stock.view',
  ],
  // Branch Manager: branch operations (NO settings/billing — distinct from Admin).
  branch_manager: [
    'sales.sell', 'sales.discount', 'sales.collect', 'sales.return',
    'customers.manage', 'customers.change_status', 'inventory.view', 'inventory.adjust', 'inventory.transfer',
    'inventory.count', 'stock_request.approve', 'purchasing.manage',
    'suppliers.manage', 'reports.view',
    'customer.transfer', 'customer.create', 'customer.edit', 'route.create', 'journey.create',
    'stock.adjust', 'stock.transfer.approve', 'visit.approve_out_of_route',
    'day.approve_close_exception', 'day.reopen.approve', 'cash.handover.confirm', 'customer.request.approve', 'stock.view', 'user.transfer',
  ],
  // IT Admin: integrations / scheduler / governance / technical settings.
  it_admin: [
    'integrations.manage', 'settings.custom_fields', 'workflow.manage',
    'settings.users',
    'customer.import', 'product.import', 'user.import', 'route.import', 'journey.import',
  ],
  supervisor: [
    'sales.sell', 'sales.discount', 'sales.collect', 'sales.return',
    'customers.manage', 'customers.change_status', 'inventory.view', 'stock_request.approve', 'reports.view',
    'visit.approve_out_of_route', 'day.approve_close_exception', 'stock.transfer.approve',
    'customer.transfer', 'journey.create', 'route.create', 'stock.view',
    'reconciliation.view', 'reconciliation.manage', 'day.reopen.approve', 'cash.handover.confirm', 'customer.request.approve',
  ],
  accountant: [
    'accounting.view', 'accounting.post', 'reports.view',
    'suppliers.manage', 'sales.collect', 'customers.change_status', 'cash.handover.confirm',
    'stock.view', 'fashion.reports', 'fashion.cashbox', 'fashion.installments', 'fashion.purchase',
  ],
  cashier: ['sales.sell', 'sales.collect', 'customers.manage', 'cash.handover.confirm', 'restaurant.manage', 'pharmacy.dispense', 'laundry.manage', 'market.pos', 'fashion.sell', 'fashion.installments', 'fashion.cashbox'],
  salesman: [
    'sales.sell', 'sales.collect', 'customers.manage',
    'inventory.view', 'stock_request.create', 'field.sales', 'field.attach_media',
    'day.close', 'day.reopen.request', 'cash.handover.request', 'customer.request', 'stock.view', 'stock.transfer', 'customer.create',
    'reconciliation.view',
  ],
  driver: [
    'sales.sell', 'sales.collect', 'customers.manage',
    'inventory.view', 'stock_request.create', 'field.sales', 'field.attach_media',
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
    'stock.view', 'stock.adjust', 'stock.transfer', 'stock.transfer.approve',
    'fashion.inventory', 'fashion.purchase', 'reconciliation.view', 'reconciliation.manage',
  ],
  staff: ['inventory.view'],
  viewer: ['reports.view', 'accounting.view', 'inventory.view'],
};

export interface PermissionContext {
  isSuperAdmin: boolean;
  /** The vendor platform owner — apex tier, holds every permission (consistent
   *  with super admins and `requireModule`). Optional for legacy/test callers. */
  isPlatformOwner?: boolean;
  permissions: Permission[];
}

/** Whether the user holds a permission. Platform owner / super admins hold all. */
export function hasPermission(ctx: PermissionContext, perm: Permission): boolean {
  return ctx.isSuperAdmin || ctx.isPlatformOwner === true || ctx.permissions.includes(perm);
}

/** Whether the user holds ANY of the given permissions (platform owner / super admins: yes). */
export function hasAnyPermission(ctx: PermissionContext, perms: Permission[]): boolean {
  return ctx.isSuperAdmin || ctx.isPlatformOwner === true || perms.some((p) => ctx.permissions.includes(p));
}

/** Resolve the concrete permission list for a role (expands '*'). */
export function permissionsForRole(role: BranchRole): Permission[] {
  const set = ROLE_PERMISSIONS[role];
  return set === ALL ? [...ALL_PERMISSIONS] : set;
}

// ─── Fashion Store owner umbrella ─────────────────────────────────────────────
/** The granular Fashion capabilities implied by holding `fashion.manage`. */
export const FASHION_UMBRELLA: Permission[] = [
  'fashion.sell', 'fashion.inventory', 'fashion.purchase',
  'fashion.installments', 'fashion.cashbox', 'fashion.reports',
];

/**
 * `fashion.manage` is the Fashion Store OWNER UMBRELLA: holding it implies the
 * full granular `fashion.*` set, so a clothing owner/manager reaches the entire
 * store (POS, products, inventory, customers, installments, suppliers, cash box,
 * reports) with a single permission. Applied once at permission resolution, so
 * nav visibility, page guards, server actions and the bottom nav all agree.
 * No effect on non-fashion permissions.
 */
export function applyFashionUmbrella(perms: Permission[]): Permission[] {
  if (!perms.includes('fashion.manage')) return perms;
  return [...new Set([...perms, ...FASHION_UMBRELLA])];
}
