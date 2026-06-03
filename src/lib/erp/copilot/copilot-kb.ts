/**
 * VANTORA Help Copilot — Knowledge Base (V1, fully deterministic, NO external AI).
 *
 * Static bilingual registry: per-screen purpose/actions/common-questions, the
 * block-reason catalogue, and action→requirement mappings. Combined at runtime
 * with the caller's own UserContext by copilot-engine.ts to produce contextual
 * help. Nothing here fetches data; it is pure metadata.
 */

import type { Permission } from '../permissions';
import type { Module } from '../navigation';
import type { BranchRole } from '../types';

export interface Bi { en: string; ar: string }

// ── Block reasons (Feature 2 / 9) ────────────────────────────────────────────
export type BlockCode =
  | 'permission_missing'
  | 'module_not_enabled'
  | 'scope_restricted'
  | 'limit_exceeded'
  | 'gps_violation'
  | 'out_of_route'
  | 'low_coverage'
  | 'workflow_pending'
  | 'section_hidden'
  | 'subscription_inactive';

export const BLOCK_REASONS: Record<BlockCode, { title: Bi; remedy: Bi }> = {
  permission_missing: {
    title: { en: 'You do not have the required permission', ar: 'لا تملك الصلاحية المطلوبة' },
    remedy: { en: 'Ask your Company Admin to grant it in Settings → Authorization Console.', ar: 'اطلب من مدير الشركة منحها من الإعدادات ← وحدة الصلاحيات.' },
  },
  module_not_enabled: {
    title: { en: 'This feature is not enabled on your plan', ar: 'هذه الميزة غير مفعّلة في باقتك' },
    remedy: { en: 'Enable the module from the company plan / marketplace.', ar: 'فعّل الوحدة من باقة الشركة / المتجر.' },
  },
  scope_restricted: {
    title: { en: 'This is outside your assigned territory', ar: 'هذا خارج نطاقك المخصص' },
    remedy: { en: 'Your role only sees its branch/region/team. Ask a manager for wider scope in the Authz Console.', ar: 'دورك يرى فرعه/منطقته/فريقه فقط. اطلب نطاقًا أوسع من المدير في وحدة الصلاحيات.' },
  },
  limit_exceeded: {
    title: { en: 'The amount exceeds your approval limit', ar: 'المبلغ يتجاوز حد الاعتماد الخاص بك' },
    remedy: { en: 'Escalate to an approver, or ask for a higher limit in the Authz Console.', ar: 'حوّل لمعتمد أعلى، أو اطلب رفع الحد من وحدة الصلاحيات.' },
  },
  gps_violation: {
    title: { en: 'You are outside the customer’s allowed GPS radius', ar: 'أنت خارج نطاق GPS المسموح للعميل' },
    remedy: { en: 'Move closer, or provide a reason / request override (needs visit.override_gps).', ar: 'اقترب أكثر، أو أدخل سببًا / اطلب تجاوزًا (يتطلب visit.override_gps).' },
  },
  out_of_route: {
    title: { en: 'This customer is not on today’s journey or not assigned to you', ar: 'هذا العميل ليس في خط سير اليوم أو غير مسند إليك' },
    remedy: { en: 'Add to the plan, or get supervisor approval (visit.approve_out_of_route).', ar: 'أضِفه للخطة، أو احصل على موافقة المشرف (visit.approve_out_of_route).' },
  },
  low_coverage: {
    title: { en: 'Coverage is below the minimum to close the day', ar: 'نسبة التغطية أقل من الحد الأدنى لإغلاق اليوم' },
    remedy: { en: 'Visit the remaining customers, or submit reasons / request approval to close.', ar: 'زُر باقي العملاء، أو أدخل الأسباب / اطلب الموافقة على الإغلاق.' },
  },
  workflow_pending: {
    title: { en: 'The request is waiting for approval', ar: 'الطلب في انتظار الموافقة' },
    remedy: { en: 'Check who the current approver is on the request, and follow up.', ar: 'تحقق من المعتمد الحالي للطلب وتابع معه.' },
  },
  section_hidden: {
    title: { en: 'This section is hidden for your role', ar: 'هذا القسم مخفي لدورك' },
    remedy: { en: 'Ask your admin to grant section access in Field Governance.', ar: 'اطلب من المدير منح صلاحية القسم في حوكمة الحقول.' },
  },
  subscription_inactive: {
    title: { en: 'The company subscription is not active', ar: 'اشتراك الشركة غير نشط' },
    remedy: { en: 'Contact the platform owner / support to renew or reactivate.', ar: 'تواصل مع مالك المنصة / الدعم للتجديد أو إعادة التفعيل.' },
  },
};

// ── Action requirements (Feature 2): map a user-intent to what it needs ───────
export interface ActionRequirement {
  key: string;
  label: Bi;
  /** ALL of these permissions (any-of inside the inner array). */
  anyPermission?: Permission[];
  module?: Module;
  /** True when only scoped roles may be blocked by territory (informational). */
  scopeSensitive?: boolean;
}

export const ACTION_REQUIREMENTS: Record<string, ActionRequirement> = {
  'customer.create': { key: 'customer.create', label: { en: 'Add a customer', ar: 'إضافة عميل' }, anyPermission: ['customer.create', 'customers.manage'] },
  'customer.edit': { key: 'customer.edit', label: { en: 'Edit this customer', ar: 'تعديل هذا العميل' }, anyPermission: ['customer.edit', 'customers.manage'], scopeSensitive: true },
  'customer.transfer': { key: 'customer.transfer', label: { en: 'Transfer a customer', ar: 'نقل عميل' }, anyPermission: ['customer.transfer'], scopeSensitive: true },
  'product.create': { key: 'product.create', label: { en: 'Add a product', ar: 'إضافة منتج' }, anyPermission: ['product.create', 'inventory.view'], module: 'inventory' },
  'stock.transfer': { key: 'stock.transfer', label: { en: 'Transfer stock', ar: 'تحويل مخزون' }, anyPermission: ['stock.transfer', 'inventory.transfer'], module: 'inventory' },
  'stock.transfer.approve': { key: 'stock.transfer.approve', label: { en: 'Approve a stock transfer', ar: 'اعتماد تحويل مخزون' }, anyPermission: ['stock.transfer.approve'] },
  'day.close': { key: 'day.close', label: { en: 'Close your day', ar: 'إغلاق يومك' }, anyPermission: ['day.close', 'field.sales'] },
  'day.approve_close_exception': { key: 'day.approve_close_exception', label: { en: 'Approve a day-close exception', ar: 'اعتماد استثناء إغلاق اليوم' }, anyPermission: ['day.approve_close_exception'] },
  'journey.create': { key: 'journey.create', label: { en: 'Create a journey plan', ar: 'إنشاء خطة زيارات' }, anyPermission: ['journey.create'] },
  'route.create': { key: 'route.create', label: { en: 'Create a route', ar: 'إنشاء خط سير' }, anyPermission: ['route.create'] },
  'visit.approve_out_of_route': { key: 'visit.approve_out_of_route', label: { en: 'Approve an out-of-route visit', ar: 'اعتماد زيارة خارج الخط' }, anyPermission: ['visit.approve_out_of_route'] },
  'user.import': { key: 'user.import', label: { en: 'Import users', ar: 'استيراد المستخدمين' }, anyPermission: ['user.import', 'settings.users'] },
  'user.transfer': { key: 'user.transfer', label: { en: 'Transfer a user', ar: 'نقل مستخدم' }, anyPermission: ['user.transfer', 'settings.users'] },
  'role.manage': { key: 'role.manage', label: { en: 'Manage roles & permissions', ar: 'إدارة الأدوار والصلاحيات' }, anyPermission: ['settings.users'] },
  'accounting.post': { key: 'accounting.post', label: { en: 'Post a journal/voucher', ar: 'ترحيل قيد/سند' }, anyPermission: ['accounting.post'], module: 'accounting' },
};

// ── Screen registry (Feature 1 / 14) ──────────────────────────────────────────
export interface ScreenHelp {
  match: string;        // route prefix
  title: Bi;
  purpose: Bi;
  actions: Bi[];        // main things you can do here
  questions: Bi[];      // suggested quick-help questions
}

export const SCREENS: ScreenHelp[] = [
  { match: '/customers', title: { en: 'Customers', ar: 'العملاء' },
    purpose: { en: 'Your customer master — create, edit, classify, and transfer customers.', ar: 'سجل العملاء الرئيسي — إنشاء وتعديل وتصنيف ونقل العملاء.' },
    actions: [{ en: 'Add a customer', ar: 'إضافة عميل' }, { en: 'Edit details / status', ar: 'تعديل البيانات / الحالة' }, { en: 'Transfer to another route/salesman', ar: 'النقل لخط/مندوب آخر' }],
    questions: [{ en: 'Why can’t I add a customer?', ar: 'لماذا لا أستطيع إضافة عميل؟' }, { en: 'How do I transfer this customer?', ar: 'كيف أنقل هذا العميل؟' }, { en: 'Why can’t I see this customer?', ar: 'لماذا لا أرى هذا العميل؟' }] },
  { match: '/products', title: { en: 'Products', ar: 'المنتجات' },
    purpose: { en: 'Your product/SKU master — pricing, packs, barcodes and status.', ar: 'سجل المنتجات — الأسعار والعبوات والباركود والحالة.' },
    actions: [{ en: 'Add a product', ar: 'إضافة منتج' }, { en: 'Set prices & tax', ar: 'تحديد الأسعار والضريبة' }], questions: [{ en: 'Why can’t I add a product?', ar: 'لماذا لا أستطيع إضافة منتج؟' }, { en: 'How do I import products?', ar: 'كيف أستورد المنتجات؟' }] },
  { match: '/field/journey', title: { en: 'Today’s Journey', ar: 'خط سير اليوم' },
    purpose: { en: 'Your planned customers for today, ordered by distance, with GPS check-in and end-of-day.', ar: 'عملاؤك المخططون لليوم مرتبين حسب المسافة، مع تسجيل الوصول GPS وإغلاق اليوم.' },
    actions: [{ en: 'Check in at a customer', ar: 'تسجيل الوصول لعميل' }, { en: 'Record an order / no-order', ar: 'تسجيل طلب / بدون طلب' }, { en: 'End the day', ar: 'إغلاق اليوم' }],
    questions: [{ en: 'Why can’t I close my day?', ar: 'لماذا لا أستطيع إغلاق يومي؟' }, { en: 'Why is this a GPS violation?', ar: 'لماذا تعتبر مخالفة GPS؟' }, { en: 'What customers are left today?', ar: 'كم عميلاً متبقٍ اليوم؟' }] },
  { match: '/settings/authz', title: { en: 'Authorization Console', ar: 'وحدة الصلاحيات' },
    purpose: { en: 'Grant capabilities, set per-user scope, approval limits, section access, roles & hierarchy.', ar: 'منح القدرات وتحديد نطاق المستخدم وحدود الاعتماد ووصول الأقسام والأدوار والهيكل.' },
    actions: [{ en: 'Grant a capability to a role', ar: 'منح قدرة لدور' }, { en: 'Set a user’s data scope', ar: 'تحديد نطاق بيانات مستخدم' }, { en: 'Set an approval limit', ar: 'تحديد حد اعتماد' }],
    questions: [{ en: 'How do I create a role?', ar: 'كيف أنشئ دورًا؟' }, { en: 'What does this permission do?', ar: 'ماذا تفعل هذه الصلاحية؟' }, { en: 'How do I give GPS approval to a supervisor?', ar: 'كيف أمنح المشرف موافقة GPS؟' }] },
  { match: '/settings/data-onboarding', title: { en: 'Data Onboarding', ar: 'إدخال البيانات' },
    purpose: { en: 'Import customers, products, users, routes and journey plans, and see import history.', ar: 'استيراد العملاء والمنتجات والمستخدمين وخطوط السير وخطط الزيارات، وعرض سجل الاستيراد.' },
    actions: [{ en: 'Upload a file & map fields', ar: 'رفع ملف ومطابقة الحقول' }, { en: 'Preview & validate before import', ar: 'معاينة وتحقق قبل الاستيراد' }],
    questions: [{ en: 'How do I import customers?', ar: 'كيف أستورد العملاء؟' }, { en: 'Why did my import fail validation?', ar: 'لماذا فشل التحقق من الاستيراد؟' }] },
  { match: '/distribution/journey-compliance', title: { en: 'Journey Compliance', ar: 'التزام خطوط السير' },
    purpose: { en: 'Coverage, visits, skips, GPS and out-of-route per salesman/day.', ar: 'التغطية والزيارات والتخطّي ومخالفات GPS وخارج الخط لكل مندوب/يوم.' },
    actions: [{ en: 'Review low-coverage reps', ar: 'مراجعة المندوبين بتغطية منخفضة' }],
    questions: [{ en: 'Why is coverage low?', ar: 'لماذا التغطية منخفضة؟' }, { en: 'Which route has the most GPS violations?', ar: 'أي خط سير به أكثر مخالفات GPS؟' }] },
];

// ── Training guides (Feature 5) ───────────────────────────────────────────────
export interface TrainingGuide { key: string; title: Bi; perm?: Permission; steps: Bi[] }

export const TRAINING_GUIDES: Record<string, TrainingGuide> = {
  create_customer: { key: 'create_customer', title: { en: 'Create a customer', ar: 'إنشاء عميل' }, perm: 'customer.create',
    steps: [{ en: 'Open Customers → New Customer.', ar: 'افتح العملاء ← عميل جديد.' }, { en: 'Enter name, channel, region/branch, route & salesman.', ar: 'أدخل الاسم والقناة والمنطقة/الفرع وخط السير والمندوب.' }, { en: 'Add GPS location and credit terms if available.', ar: 'أضِف موقع GPS وشروط الائتمان إن وُجدت.' }, { en: 'Save — it is created with source = manual.', ar: 'احفظ — يُنشأ بمصدر = يدوي.' }] },
  create_route: { key: 'create_route', title: { en: 'Create a route', ar: 'إنشاء خط سير' }, perm: 'route.create',
    steps: [{ en: 'Open Distribution → Routes → New.', ar: 'افتح التوزيع ← خطوط السير ← جديد.' }, { en: 'Set code, name, region/city, branch and salesman.', ar: 'حدد الكود والاسم والمنطقة/المدينة والفرع والمندوب.' }, { en: 'Pick working days, then add customers & sequence.', ar: 'اختر أيام العمل، ثم أضِف العملاء والترتيب.' }] },
  import_customers: { key: 'import_customers', title: { en: 'Import customers', ar: 'استيراد العملاء' }, perm: 'customer.import',
    steps: [{ en: 'Open Settings → Data Onboarding → Customers.', ar: 'افتح الإعدادات ← إدخال البيانات ← العملاء.' }, { en: 'Upload your Excel/CSV and map columns to fields.', ar: 'ارفع ملف Excel/CSV وطابق الأعمدة بالحقول.' }, { en: 'Preview, fix validation errors, then confirm import.', ar: 'عاين، صحّح أخطاء التحقق، ثم أكّد الاستيراد.' }] },
  transfer_stock: { key: 'transfer_stock', title: { en: 'Transfer stock (van-to-van)', ar: 'تحويل مخزون (عربة لعربة)' }, perm: 'stock.transfer',
    steps: [{ en: 'Choose source and destination van.', ar: 'اختر العربة المصدر والوجهة.' }, { en: 'Select products and quantities (cannot exceed available).', ar: 'اختر المنتجات والكميات (لا تتجاوز المتاح).' }, { en: 'Submit — small values auto-approve; larger ones await an approver.', ar: 'أرسل — القيم الصغيرة تُعتمد تلقائيًا، والأكبر تنتظر معتمدًا.' }] },
  create_company: { key: 'create_company', title: { en: 'Create a company', ar: 'إنشاء شركة' },
    steps: [{ en: 'Platform Owner → Onboarding Wizard.', ar: 'مالك المنصة ← معالج التهيئة.' }, { en: 'Enter basics, pick an Industry Pack and a Permission Template.', ar: 'أدخل الأساسيات، اختر حزمة الصناعة وقالب الصلاحيات.' }, { en: 'Choose roles & hierarchy, review, then create.', ar: 'اختر الأدوار والهيكل، راجع، ثم أنشئ.' }] },
};

export const ROLE_LABEL: Record<string, Bi> = {} as Record<string, Bi>; // resolved via BRANCH_ROLES in the engine

export type { Permission, Module, BranchRole };
