/** ── Licensing catalog (UI alignment) ──────────────────────────────────────
 *  The single source of truth for the licensing-model UI grouping:
 *  Core Modules (capabilities) vs Industry Packs (verticals), the pack → core
 *  preselect map, and pack → suggested-role sets. Pure + client-safe (consumed
 *  by the Setup Wizard and Marketplace to separate the groups). Business Type
 *  only PRESELECTS via these maps — it never restricts licensing choices.
 *
 *  Note: full per-capability entitlement wiring (new module keys crm/workflow/
 *  analytics/field_ops/integrations) lands with the R4 licensing build; this
 *  catalog drives the screen grouping + defaults now. */

export interface CatalogItem { key: string; labelEn: string; labelAr: string }

/** Core (capability) modules — independently licensable. */
export const CORE_MODULES: CatalogItem[] = [
  { key: 'crm', labelEn: 'CRM', labelAr: 'إدارة العملاء' },
  { key: 'sales', labelEn: 'Sales', labelAr: 'المبيعات' },
  { key: 'inventory', labelEn: 'Inventory', labelAr: 'المخزون' },
  { key: 'purchasing', labelEn: 'Purchasing', labelAr: 'المشتريات' },
  { key: 'finance', labelEn: 'Finance / Accounting', labelAr: 'المالية / المحاسبة' },
  { key: 'pos', labelEn: 'POS', labelAr: 'نقاط البيع' },
  { key: 'workflow', labelEn: 'Workflow & Approvals', labelAr: 'سير العمل والموافقات' },
  { key: 'analytics', labelEn: 'Analytics', labelAr: 'التحليلات' },
  { key: 'field_ops', labelEn: 'Field Operations', labelAr: 'العمليات الميدانية' },
  { key: 'integrations', labelEn: 'Integrations', labelAr: 'التكاملات' },
];

/** Industry packs — bundles of core modules + vertical features (add-ons). */
export const INDUSTRY_PACKS: CatalogItem[] = [
  { key: 'clinic', labelEn: 'Clinic', labelAr: 'العيادة' },
  { key: 'pharmacy', labelEn: 'Pharmacy', labelAr: 'الصيدلية' },
  { key: 'distribution', labelEn: 'Distribution', labelAr: 'التوزيع' },
  { key: 'retail', labelEn: 'Retail', labelAr: 'التجزئة' },
  { key: 'electrical', labelEn: 'Electrical Retail & Wholesale', labelAr: 'تجارة الكهربائيات بالجملة والتجزئة' },
  { key: 'restaurant', labelEn: 'Restaurant / Café', labelAr: 'مطعم / مقهى' },
  { key: 'hotel', labelEn: 'Hotel', labelAr: 'الفندق' },
  { key: 'salon', labelEn: 'Salon', labelAr: 'الصالون' },
  { key: 'laundry', labelEn: 'Laundry', labelAr: 'المغسلة' },
  { key: 'fashion', labelEn: 'Fashion Store', labelAr: 'متجر الملابس' },
];

/** Pack → recommended Core Modules (preselect defaults; fully editable). */
export const PACK_CORE_PRESELECT: Record<string, string[]> = {
  clinic: ['crm', 'sales', 'inventory', 'workflow', 'analytics'],
  pharmacy: ['sales', 'inventory', 'purchasing', 'finance', 'pos', 'analytics'],
  distribution: ['crm', 'sales', 'inventory', 'purchasing', 'analytics', 'field_ops', 'workflow'],
  retail: ['sales', 'inventory', 'purchasing', 'finance', 'pos'],
  electrical: ['sales', 'inventory', 'purchasing', 'finance', 'pos', 'analytics'],
  restaurant: ['sales', 'inventory', 'purchasing', 'pos'],
  hotel: ['sales', 'inventory', 'purchasing', 'finance', 'workflow'],
  salon: ['sales', 'pos', 'crm'],
  laundry: ['sales', 'pos', 'workflow'],
  fashion: ['sales', 'inventory', 'purchasing', 'finance', 'pos'],
};

/** Pack → suggested roles (seed; fully editable after suggestion). */
export const PACK_ROLE_SUGGESTIONS: Record<string, string[]> = {
  clinic: ['System Admin', 'Clinic Manager', 'Receptionist', 'Doctor', 'Accountant'],
  pharmacy: ['System Admin', 'Pharmacist', 'Cashier', 'Storekeeper', 'Accountant'],
  distribution: ['System Admin', 'Sales Manager', 'Sales Supervisor', 'Salesman', 'Warehouse Keeper', 'Driver', 'Accountant'],
  electrical: ['System Administrator', 'General Manager', 'Branch Manager', 'Sales Manager', 'Sales Supervisor', 'Sales Representative', 'Projects Sales Representative', 'Purchasing Manager', 'Warehouse Keeper', 'Warehouse Supervisor', 'Accountant', 'Warranty Officer', 'RMA Officer', 'Driver / Delivery Representative'],
  retail: ['System Admin', 'Branch Manager', 'Cashier', 'Storekeeper'],
  fashion: ['System Admin', 'Salesperson', 'Storekeeper', 'Accountant'],
};

/** ── Display-only UI content (NO licensing logic) ──────────────────────────
 *  One-line, plain-language descriptions of what each module/pack does, keyed by
 *  the DB module key (see `Module` in navigation.ts). Purely for the no-training
 *  goal — a first-time user reads the card and understands it in seconds. These
 *  do NOT gate, restrict, or drive any entitlement; they are surfaced as text in
 *  the Marketplace and Company 360 only. Bilingual to match MODULE_LABELS. */
export const MODULE_DESCRIPTIONS: Record<string, { en: string; ar: string }> = {
  // Core capabilities
  crm:          { en: 'Track customers, contacts and follow-ups.', ar: 'تتبّع العملاء وجهات الاتصال والمتابعات.' },
  sales:        { en: 'Quotes, orders and invoices for what you sell.', ar: 'عروض الأسعار والطلبات والفواتير لما تبيعه.' },
  inventory:    { en: 'Products, stock levels and movements.', ar: 'المنتجات ومستويات المخزون والحركات.' },
  purchasing:   { en: 'Suppliers, purchase orders and receiving.', ar: 'الموردون وأوامر الشراء والاستلام.' },
  accounting:   { en: 'Ledger, vouchers and financial reports.', ar: 'دفتر الأستاذ والسندات والتقارير المالية.' },
  pos:          { en: 'Fast walk-in checkout at the counter.', ar: 'بيع سريع للعملاء عند الكاونتر.' },
  workflow:     { en: 'Approval steps and task routing.', ar: 'خطوات الموافقة وتوجيه المهام.' },
  analytics:    { en: 'Dashboards and reports across your data.', ar: 'لوحات المعلومات والتقارير على بياناتك.' },
  field_ops:    { en: 'Mobile app for reps and drivers in the field.', ar: 'تطبيق ميداني للمندوبين والسائقين.' },
  integrations: { en: 'Connect external systems and APIs.', ar: 'ربط الأنظمة الخارجية وواجهات البرمجة.' },
  fashion:      { en: 'Clothing store: variants, barcodes, cash & installment sales.', ar: 'متجر ملابس: مقاسات وألوان وباركود وبيع نقدي وتقسيط.' },
  // Item-level refinements
  sales_orders: { en: 'Multi-step orders before invoicing.', ar: 'طلبات متعددة الخطوات قبل الفوترة.' },
  returns:      { en: 'Handle customer returns and refunds.', ar: 'معالجة مرتجعات العملاء والاستردادات.' },
  warehousing:  { en: 'Multiple warehouses, transfers and counts.', ar: 'مخازن متعددة وتحويلات وجرد.' },
  // Industry packs (verticals)
  clinic:       { en: 'Appointments, patients and visits.', ar: 'المواعيد والمرضى والزيارات.' },
  pharmacy:     { en: 'Dispensing with expiry and batch tracking.', ar: 'الصرف مع تتبّع الانتهاء والدفعات.' },
  restaurant:   { en: 'Tables, orders and kitchen display.', ar: 'الطاولات والطلبات وشاشة المطبخ.' },
  salon:        { en: 'Bookings, tickets and services.', ar: 'الحجوزات والتذاكر والخدمات.' },
  hotel:        { en: 'Rooms and guest bookings.', ar: 'الغرف وحجوزات النزلاء.' },
  laundry:      { en: 'Garment orders and service tracking.', ar: 'طلبات الملابس وتتبّع الخدمة.' },
  market:       { en: 'Supermarket cashier and barcode sales.', ar: 'كاشير السوبر ماركت والبيع بالباركود.' },
  wholesale:    { en: 'Tiered price levels for bulk buyers.', ar: 'مستويات أسعار للمشترين بالجملة.' },
  distribution: { en: 'Routes, journeys and rep settlement.', ar: 'خطوط السير والرحلات وتسوية المندوبين.' },
};

/** Display-only advisory dependency hints (NOT enforced). Maps a module to the
 *  modules it works best alongside, so the UI can show an advisory note (e.g.
 *  "POS works best with Sales") and warn before turning a depended-on module off.
 *  This is purely informational UI copy — it does NOT block, cascade, or change
 *  any write. Real entitlement wiring is out of scope for this UI batch. */
export const MODULE_DEPENDENCIES: Record<string, string[]> = {
  pos:          ['sales', 'inventory'],
  sales_orders: ['sales'],
  returns:      ['sales'],
  warehousing:  ['inventory'],
  pharmacy:     ['inventory'],
  market:       ['sales', 'inventory'],
  wholesale:    ['sales'],
  distribution: ['sales'],
  restaurant:   ['sales'],
};

/** Reverse lookup: which modules list `key` as a dependency (advisory). Used to
 *  warn before disabling a module that others rely on. Pure, display-only. */
export function dependentsOf(key: string, present: readonly string[]): string[] {
  return present.filter((m) => (MODULE_DEPENDENCIES[m] ?? []).includes(key));
}

/** DB module keys that belong to a Core capability (everything else = an
 *  industry/vertical = a Pack). Includes the R4B capability keys. */
const CORE_MODULE_KEYS = new Set([
  'sales', 'inventory', 'warehousing', 'purchasing', 'accounting', 'pos',
  'crm', 'workflow', 'analytics', 'field_ops', 'integrations',
]);

/** Classify a module key into the new grouping. */
export function classifyModuleKey(key: string): 'core' | 'pack' {
  return CORE_MODULE_KEYS.has(key) ? 'core' : 'pack';
}

/** Vertical (pack) keys that are REAL DB module keys (mirror of the pack entries
 *  in `Module`/`ALL_MODULES`). Abstract packs (`retail`, `electrical`) are NOT
 *  here — they have no own DB module. Kept local to keep this catalog free of the
 *  icon-bearing navigation import. */
const DB_MODULE_KEYS = new Set([
  'hotel', 'clinic', 'restaurant', 'salon', 'pharmacy', 'laundry', 'market', 'wholesale', 'distribution', 'fashion',
]);

/** Catalog Core-module key → DB module key (only `finance` differs: ≙ accounting). */
export function coreModuleDbKey(catalogKey: string): string {
  return catalogKey === 'finance' ? 'accounting' : catalogKey;
}

/** Is a module enabled for a company (from its loaded enabled-module list)?
 *  Empty list = unrestricted (legacy/owner) → true. Graceful by design. */
export function moduleEnabled(enabledModules: readonly string[], moduleKey: string): boolean {
  if (enabledModules.length === 0) return true;
  return enabledModules.includes(moduleKey);
}

/** Map a business-type / vertical key to its Industry Pack key (preselect). */
export function packForBusinessType(businessType: string): string | undefined {
  const bt = businessType.toLowerCase();
  if (bt.includes('clinic')) return 'clinic';
  if (bt.includes('pharmacy')) return 'pharmacy';
  if (bt.includes('distribution')) return 'distribution';
  if (bt.includes('electrical')) return 'electrical';
  if (bt.includes('restaurant') || bt.includes('cafe') || bt.includes('café')) return 'restaurant';
  if (bt.includes('hotel')) return 'hotel';
  if (bt.includes('salon')) return 'salon';
  if (bt.includes('laundry')) return 'laundry';
  if (bt.includes('clothing') || bt.includes('fashion') || bt.includes('apparel') || bt.includes('boutique')) return 'fashion';
  if (bt.includes('retail') || bt.includes('market') || bt.includes('supermarket') || bt.includes('wholesale')) return 'retail';
  return undefined;
}

/** Suggested roles for a business type (via its pack), or null when none. */
export function suggestedRolesForBusinessType(businessType: string): string[] | null {
  const pack = packForBusinessType(businessType);
  return pack ? (PACK_ROLE_SUGGESTIONS[pack] ?? null) : null;
}

/** Recommended DB module keys for a business type — the pack's preselected Core
 *  modules (mapped to DB keys) plus the pack's own vertical module key. Returns
 *  null when the business type has no known pack. Pure + display-only: drives the
 *  "Reset to defaults" preview/diff in the UI; it does NOT itself write anything
 *  (callers loop the EXISTING toggle action). Mirrors the Setup Wizard preselect
 *  so "reset" lands on the same recommended set, no new server logic. */
export function recommendedModulesForBusinessType(businessType: string): string[] | null {
  const pack = packForBusinessType(businessType);
  if (!pack) return null;
  const core = (PACK_CORE_PRESELECT[pack] ?? []).map(coreModuleDbKey);
  // The pack key is itself a DB vertical module key only when it is a real DB
  // module (e.g. `clinic`, `pharmacy`); abstract packs (`retail`, `electrical`)
  // have no own DB module and contribute only their preselected Core modules.
  const vertical = DB_MODULE_KEYS.has(pack) ? [pack] : [];
  return Array.from(new Set([...core, ...vertical]));
}
