import type { Module } from './navigation';

/** ── Smart Setup Wizard: declarative, per-business-type onboarding ──────────
 *
 * A SAFE layer ABOVE the existing platform. It does NOT replace templates — the
 * business-type templates (erp_business_type_modules / _roles) still seed the
 * workspace; the wizard customizes the selected template based on the user's
 * answers and shows a clean review before finishing.
 *
 * What it actually persists: the company's ENABLED MODULES (via the guarded
 * erp_apply_setup_modules RPC). Roles are already auto-seeded per business type
 * by the DB, and dashboards are already per-vertical — so in the wizard those
 * appear as a REVIEW/PREVIEW of what the workspace will include. This keeps the
 * wizard powerful yet non-breaking.
 *
 * Extending: every business type below has a profile. To tune a vertical, edit
 * its profile object — no screen or logic changes needed.
 */

export interface Bilingual { ar: string; en: string }

/** A single-choice question whose chosen option flips modules on/off. */
export interface SetupOption {
  value: string;
  labelAr: string;
  labelEn: string;
  descAr?: string;
  descEn?: string;
  enable?: Module[];
  disable?: Module[];
}
export interface SetupQuestion {
  id: string;
  titleAr: string;
  titleEn: string;
  options: SetupOption[];
}

/** An optional module the user can switch on/off in the "modules" step. */
export interface ModuleToggle {
  module: Module;
  labelAr: string;
  labelEn: string;
  /** Default state for this business type. */
  defaultOn: boolean;
}

export interface SetupProfile {
  introAr: string;
  introEn: string;
  /** Business-specific branching questions (size, reps, …). */
  questions: SetupQuestion[];
  /** Optional modules the user can toggle (the "Required modules" step). */
  moduleToggles: ModuleToggle[];
  /** Suggested roles for this business (review/preview; auto-seeded by DB). */
  roles: Bilingual[];
  /** Suggested dashboard KPIs for this business (review/preview). */
  kpis: Bilingual[];
}

// ── small builders to keep profiles concise ───────────────────────────────
const tog = (module: Module, ar: string, en: string, defaultOn = true): ModuleToggle => ({ module, labelAr: ar, labelEn: en, defaultOn });
const bi = (ar: string, en: string): Bilingual => ({ ar, en });

const SIZE_QUESTION: SetupQuestion = {
  id: 'size',
  titleAr: 'حجم نشاطك؟',
  titleEn: 'How big is your business?',
  options: [
    { value: 'solo', labelAr: 'صغير — بشتغل لوحدي', labelEn: 'Small — I work alone', descAr: 'شاشات بسيطة وسريعة.', descEn: 'A lean, fast workspace.', disable: ['warehousing'] },
    { value: 'team', labelAr: 'فريق عمل (عدة موظفين)', labelEn: 'A team (several staff)', descAr: 'صلاحيات وأدوار متعددة.', descEn: 'Roles and permissions.' },
    { value: 'company', labelAr: 'شركة كاملة (فروع/مخازن)', labelEn: 'Full company (branches/warehouses)', descAr: 'كل الأدوات + تعدد الفروع والمخازن.', descEn: 'Full toolkit + multi-branch & warehouses.', enable: ['warehousing', 'accounting'] },
  ],
};

const REPS_QUESTION: SetupQuestion = {
  id: 'reps',
  titleAr: 'عندك مناديب توزيع بيبيعوا برّه؟',
  titleEn: 'Do you have field sales reps?',
  options: [
    { value: 'no', labelAr: 'لا', labelEn: 'No', disable: ['distribution'] },
    { value: 'yes', labelAr: 'نعم — عندي مناديب', labelEn: 'Yes — I have reps', descAr: 'يفعّل تطبيق المندوب وخطوط السير والتحصيل.', descEn: 'Enables the rep app, routes, and collection.', enable: ['distribution', 'sales_orders', 'field_ops'] },
  ],
};

// ── Profiles per business type ─────────────────────────────────────────────

const CLINIC: SetupProfile = {
  introAr: 'جهّز عيادتك في خطوات بسيطة.',
  introEn: 'Set up your clinic in a few simple steps.',
  questions: [{
    id: 'size', titleAr: 'حجم العيادة؟', titleEn: 'Clinic size?',
    options: [
      { value: 'solo', labelAr: 'دكتور واحد', labelEn: 'Single doctor' },
      { value: 'multi', labelAr: 'مركز طبي (عدة أطباء + سكرتارية)', labelEn: 'Medical center (multiple doctors + reception)' },
    ],
  }],
  moduleToggles: [
    tog('clinic', 'العيادة (مواعيد/كشوفات/روشتات)', 'Clinic (appointments/visits/prescriptions)'),
    tog('accounting', 'الحسابات والتقارير المالية', 'Accounting & financial reports'),
    tog('inventory', 'مخزون الأدوية/المستلزمات', 'Inventory (drugs/supplies)', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('طبيب', 'Doctor'), bi('استقبال', 'Receptionist'), bi('محاسب', 'Accountant')],
  kpis: [bi('مواعيد اليوم', 'Today Appointments'), bi('المرضى النشطون', 'Active Patients'), bi('الإيراد', 'Revenue'), bi('مدفوعات معلّقة', 'Pending Payments')],
};

const PHARMACY: SetupProfile = {
  introAr: 'جهّز صيدليتك في خطوات بسيطة.',
  introEn: 'Set up your pharmacy in a few simple steps.',
  questions: [SIZE_QUESTION],
  moduleToggles: [
    tog('pharmacy', 'صرف الأدوية وتتبّع الصلاحية', 'Dispensing & expiry tracking'),
    tog('inventory', 'المخزون والأرصدة', 'Inventory & stock'),
    tog('purchasing', 'المشتريات والموردين', 'Purchasing & suppliers'),
    tog('accounting', 'الحسابات', 'Accounting'),
  ],
  roles: [bi('مدير', 'Admin'), bi('صيدلي', 'Pharmacist'), bi('كاشير', 'Cashier'), bi('أمين مخزن', 'Inventory Manager')],
  kpis: [bi('مبيعات اليوم', 'Today Sales'), bi('أصناف تحت الحد', 'Low Stock Items'), bi('قرب انتهاء الصلاحية', 'Near Expiry Items'), bi('الإيراد', 'Revenue')],
};

const WHOLESALE: SetupProfile = {
  introAr: 'جهّز شركة التوزيع في خطوات بسيطة.',
  introEn: 'Set up your distribution company in a few simple steps.',
  questions: [SIZE_QUESTION, REPS_QUESTION, {
    id: 'wholesale', titleAr: 'بتبيع جملة بأسعار مختلفة حسب العميل؟', titleEn: 'Tiered wholesale pricing?',
    options: [
      { value: 'yes', labelAr: 'نعم — مستويات أسعار', labelEn: 'Yes — price tiers', enable: ['wholesale'] },
      { value: 'no', labelAr: 'لا — أسعار موحّدة', labelEn: 'No — single pricing', disable: ['wholesale'] },
    ],
  }],
  moduleToggles: [
    tog('sales', 'المبيعات والفواتير', 'Sales & invoices'),
    tog('inventory', 'المخزون والأرصدة', 'Inventory & stock'),
    tog('purchasing', 'المشتريات والموردين', 'Purchasing & suppliers'),
    tog('distribution', 'التوزيع والمناديب', 'Distribution & field reps'),
    tog('wholesale', 'أسعار الجملة بالمستويات', 'Tiered wholesale pricing'),
    tog('accounting', 'الحسابات', 'Accounting'),
  ],
  roles: [bi('مدير', 'Admin'), bi('مدير مبيعات', 'Sales Manager'), bi('مشرف', 'Supervisor'), bi('مندوب', 'Salesman'), bi('أمين مخزن', 'Warehouse User')],
  kpis: [bi('زيارات اليوم', 'Today Visits'), bi('أوامر البيع', 'Sales Orders'), bi('خطوط السير النشطة', 'Active Routes'), bi('مخاطر المخزون', 'Stock Risk'), bi('التحصيل', 'Collection')],
};

const LAUNDRY: SetupProfile = {
  introAr: 'جهّز مغسلتك في خطوات بسيطة.',
  introEn: 'Set up your laundry in a few simple steps.',
  questions: [{
    id: 'delivery', titleAr: 'بتعمل استلام وتسليم للعميل؟', titleEn: 'Do you offer pickup & delivery?',
    options: [
      { value: 'yes', labelAr: 'نعم', labelEn: 'Yes' },
      { value: 'no', labelAr: 'لا — استلام من المحل', labelEn: 'No — in-store only' },
    ],
  }],
  moduleToggles: [
    tog('laundry', 'إدارة المغسلة (طلبات/غسيل/تسليم)', 'Laundry (orders/wash/delivery)'),
    tog('accounting', 'الحسابات', 'Accounting', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('كاشير', 'Cashier'), bi('سائق استلام', 'Pickup Driver'), bi('سائق تسليم', 'Delivery Driver'), bi('موظف تشغيل', 'Operations User')],
  kpis: [bi('طلبات جديدة', 'New Orders'), bi('قيد التنفيذ', 'In Progress'), bi('جاهز للتسليم', 'Ready for Delivery'), bi('الإيراد', 'Revenue')],
};

const SERVICES_GAMING: SetupProfile = {
  introAr: 'جهّز صالة الألعاب في خطوات بسيطة.',
  introEn: 'Set up your gaming lounge in a few simple steps.',
  questions: [SIZE_QUESTION],
  moduleToggles: [
    tog('sales', 'الكاشير والفواتير', 'Cashier & invoices'),
    tog('inventory', 'مخزون البوفيه/المنتجات', 'Snacks/products inventory', false),
    tog('accounting', 'الحسابات', 'Accounting', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('كاشير', 'Cashier'), bi('موظف صالة', 'Floor Staff'), bi('مشرف', 'Manager')],
  kpis: [bi('الجلسات النشطة', 'Active Sessions'), bi('الأجهزة المتاحة', 'Available Stations'), bi('إيراد اليوم', 'Today Revenue'), bi('الحجوزات المفتوحة', 'Open Bookings')],
};

const RETAIL: SetupProfile = {
  introAr: 'جهّز متجرك في خطوات بسيطة.',
  introEn: 'Set up your store in a few simple steps.',
  questions: [SIZE_QUESTION, REPS_QUESTION],
  moduleToggles: [
    tog('sales', 'الكاشير والفواتير', 'Cashier & invoices'),
    tog('inventory', 'المخزون والأرصدة', 'Inventory & stock'),
    tog('purchasing', 'المشتريات والموردين', 'Purchasing & suppliers'),
    tog('accounting', 'الحسابات', 'Accounting', false),
    tog('distribution', 'مناديب التوزيع', 'Field reps', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('كاشير', 'Cashier'), bi('أمين مخزن', 'Inventory Manager'), bi('محاسب', 'Accountant')],
  kpis: [bi('مبيعات اليوم', 'Today Sales'), bi('أصناف تحت الحد', 'Low Stock Items'), bi('الإيراد', 'Revenue'), bi('مديونيات العملاء', 'Customer Receivables')],
};

const RESTAURANT: SetupProfile = {
  introAr: 'جهّز مطعمك/كافيهك في خطوات بسيطة.',
  introEn: 'Set up your restaurant/café in a few simple steps.',
  questions: [{
    id: 'mode', titleAr: 'طريقة الخدمة؟', titleEn: 'Service style?',
    options: [
      { value: 'dinein', labelAr: 'صالة وطاولات', labelEn: 'Dine-in & tables' },
      { value: 'delivery', labelAr: 'دليفري / تيك أواي', labelEn: 'Delivery / takeaway' },
    ],
  }],
  moduleToggles: [
    tog('restaurant', 'المطعم (طاولات/أوردرات/مطبخ)', 'Restaurant (tables/orders/kitchen)'),
    tog('inventory', 'مخزون المكوّنات', 'Ingredients inventory', false),
    tog('accounting', 'الحسابات', 'Accounting', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('كاشير', 'Cashier'), bi('ويتر', 'Waiter'), bi('مطبخ', 'Kitchen')],
  kpis: [bi('أوردرات اليوم', "Today Orders"), bi('طاولات مشغولة', 'Open Tables'), bi('إيراد اليوم', 'Today Revenue'), bi('متوسط الفاتورة', 'Avg Ticket')],
};

const SALON: SetupProfile = {
  introAr: 'جهّز الصالون في خطوات بسيطة.',
  introEn: 'Set up your salon in a few simple steps.',
  questions: [SIZE_QUESTION],
  moduleToggles: [
    tog('salon', 'الصالون (خدمات/مواعيد/تذاكر)', 'Salon (services/appointments/tickets)'),
    tog('inventory', 'مخزون المنتجات', 'Products inventory', false),
    tog('accounting', 'الحسابات', 'Accounting', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('كاشير', 'Cashier'), bi('مزيّن/أخصائي', 'Stylist'), bi('استقبال', 'Receptionist')],
  kpis: [bi('مواعيد اليوم', 'Today Appointments'), bi('تذاكر مفتوحة', 'Open Tickets'), bi('إيراد اليوم', 'Today Revenue'), bi('العملاء', 'Customers')],
};

const HOTEL: SetupProfile = {
  introAr: 'جهّز الفندق/الشقق في خطوات بسيطة.',
  introEn: 'Set up your hotel/apartments in a few simple steps.',
  questions: [SIZE_QUESTION],
  moduleToggles: [
    tog('hotel', 'الفندق (غرف/حجوزات)', 'Hotel (rooms/bookings)'),
    tog('accounting', 'الحسابات', 'Accounting', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('استقبال', 'Front Desk'), bi('محاسب', 'Accountant'), bi('تدبير فندقي', 'Housekeeping')],
  kpis: [bi('الغرف المتاحة', 'Available Rooms'), bi('حجوزات اليوم', "Today Bookings"), bi('نسبة الإشغال', 'Occupancy'), bi('الإيراد', 'Revenue')],
};

const SUPERMARKET: SetupProfile = {
  introAr: 'جهّز السوبر ماركت في خطوات بسيطة.',
  introEn: 'Set up your supermarket in a few simple steps.',
  questions: [SIZE_QUESTION],
  moduleToggles: [
    tog('market', 'الكاشير السريع (سوبر ماركت)', 'Quick cashier (supermarket)'),
    tog('inventory', 'المخزون والأرصدة', 'Inventory & stock'),
    tog('purchasing', 'المشتريات والموردين', 'Purchasing & suppliers'),
    tog('accounting', 'الحسابات', 'Accounting', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('كاشير', 'Cashier'), bi('أمين مخزن', 'Inventory Manager'), bi('محاسب', 'Accountant')],
  kpis: [bi('مبيعات اليوم', 'Today Sales'), bi('أصناف تحت الحد', 'Low Stock Items'), bi('قرب انتهاء الصلاحية', 'Near Expiry'), bi('الإيراد', 'Revenue')],
};

// Electronics / electrical supplies (with the rich size question kept).
const ELECTRONICS: SetupProfile = {
  introAr: 'نظّم متجرك في خطوات بسيطة — جاوب على بعض الأسئلة ونجهّز لك الشاشات المناسبة لحجم نشاطك.',
  introEn: 'Set up your store in a few steps — answer a few questions and we tailor the screens to your size.',
  questions: [
    {
      id: 'size', titleAr: 'حجم نشاطك؟', titleEn: 'How big is your business?',
      options: [
        { value: 'solo', labelAr: 'محل صغير — بشتغل لوحدي', labelEn: 'Small shop — I work alone', descAr: 'كاشير سريع ومنتجات وتقارير يومية فقط.', descEn: 'Just a fast cashier, products, and daily reports.', disable: ['warehousing', 'distribution', 'sales_orders'] },
        { value: 'shop_store', labelAr: 'محل + مخزن', labelEn: 'Shop + a stockroom', descAr: 'كل ما سبق + المخزون والمشتريات والموردين.', descEn: 'Everything above + inventory, purchasing, suppliers.', enable: ['inventory', 'purchasing'], disable: ['distribution', 'sales_orders'] },
        { value: 'company', labelAr: 'شركة — فريق عمل (مدير/محاسب/كاشير/مخزن)', labelEn: 'Company — a team (manager/accountant/cashier/store)', descAr: 'كل الأدوات + الحسابات وتعدد المخازن والصلاحيات.', descEn: 'Full toolkit + accounting, multi-warehouse, permissions.', enable: ['inventory', 'purchasing', 'accounting', 'warehousing', 'sales_orders'], disable: ['distribution'] },
      ],
    },
    REPS_QUESTION,
    { id: 'wholesale', titleAr: 'بتبيع جملة بأسعار مختلفة حسب العميل؟', titleEn: 'Do you sell wholesale with tiered prices?',
      options: [
        { value: 'no', labelAr: 'لا — أسعار موحّدة', labelEn: 'No — single pricing', disable: ['wholesale'] },
        { value: 'yes', labelAr: 'نعم — مستويات أسعار (جملة/نص جملة/قطاعي)', labelEn: 'Yes — price tiers (wholesale/semi/retail)', enable: ['wholesale'] },
      ] },
  ],
  moduleToggles: [
    tog('sales', 'المبيعات والفواتير', 'Sales & invoices'),
    tog('inventory', 'المخزون والأرصدة', 'Inventory & stock'),
    tog('purchasing', 'المشتريات والموردين', 'Purchasing & suppliers'),
    tog('accounting', 'الحسابات', 'Accounting', false),
    tog('distribution', 'مناديب التوزيع', 'Field reps', false),
    tog('wholesale', 'أسعار الجملة بالمستويات', 'Tiered wholesale pricing', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('كاشير', 'Cashier'), bi('أمين مخزن', 'Inventory Manager'), bi('مندوب', 'Salesman')],
  kpis: [bi('مبيعات اليوم', 'Today Sales'), bi('أصناف تحت الحد', 'Low Stock Items'), bi('الإيراد', 'Revenue'), bi('مديونيات العملاء', 'Customer Receivables')],
};

// Generic profile for the remaining retail-style verticals (clothing, bakery,
// butchery, herbalist, auto_parts, bookstore, workshop, delivery, cafe, general).
const GENERIC: SetupProfile = {
  introAr: 'جهّز نشاطك في خطوات بسيطة.',
  introEn: 'Set up your business in a few simple steps.',
  questions: [SIZE_QUESTION, REPS_QUESTION],
  moduleToggles: [
    tog('sales', 'المبيعات والفواتير', 'Sales & invoices'),
    tog('inventory', 'المخزون والأرصدة', 'Inventory & stock'),
    tog('purchasing', 'المشتريات والموردين', 'Purchasing & suppliers'),
    tog('accounting', 'الحسابات', 'Accounting', false),
    tog('distribution', 'مناديب التوزيع', 'Field reps', false),
  ],
  roles: [bi('مدير', 'Admin'), bi('كاشير', 'Cashier'), bi('أمين مخزن', 'Inventory Manager'), bi('محاسب', 'Accountant')],
  kpis: [bi('مبيعات اليوم', 'Today Sales'), bi('المخزون', 'Inventory'), bi('الإيراد', 'Revenue'), bi('مديونيات العملاء', 'Customer Receivables')],
};

/** Every business type maps to a profile (explicit one or the generic). */
export const SETUP_PROFILES: Record<string, SetupProfile> = {
  clinic: CLINIC,
  pharmacy: PHARMACY,
  wholesale: WHOLESALE,
  laundry: LAUNDRY,
  services: SERVICES_GAMING,
  restaurant: RESTAURANT,
  cafe: RESTAURANT,
  salon: SALON,
  hotel: HOTEL,
  supermarket: SUPERMARKET,
  electronics: ELECTRONICS,
  // retail-style verticals → generic
  general: GENERIC,
  clothing: GENERIC,
  bakery: GENERIC,
  butchery: GENERIC,
  herbalist: GENERIC,
  auto_parts: GENERIC,
  bookstore: GENERIC,
  workshop: GENERIC,
  delivery: GENERIC,
};

export function getSetupProfile(businessType: string | null | undefined): SetupProfile | null {
  if (!businessType) return null;
  return SETUP_PROFILES[businessType] ?? GENERIC;
}

/** Resolve all answers (single-choice questions + module toggles) → the final
 *  enable / disable sets applied on top of the business type's defaults.
 *  Toggle answers are keyed `mod:<module>` = 'on' | 'off'. */
export function resolveModuleChanges(
  profile: SetupProfile,
  answers: Record<string, string>,
): { enable: Module[]; disable: Module[] } {
  const enable = new Set<Module>();
  const disable = new Set<Module>();
  const on = (m: Module) => { enable.add(m); disable.delete(m); };
  const off = (m: Module) => { disable.add(m); enable.delete(m); };

  for (const q of profile.questions) {
    const chosen = answers[q.id] ?? q.options[0]?.value;
    const opt = q.options.find((o) => o.value === chosen);
    if (!opt) continue;
    (opt.enable ?? []).forEach(on);
    (opt.disable ?? []).forEach(off);
  }
  // Explicit module toggles win last.
  for (const t of profile.moduleToggles) {
    const a = answers[`mod:${t.module}`];
    const isOn = a === undefined ? t.defaultOn : a === 'on';
    if (isOn) on(t.module); else off(t.module);
  }
  return { enable: [...enable], disable: [...disable] };
}
