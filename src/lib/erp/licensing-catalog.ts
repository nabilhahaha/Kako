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
};

/** Pack → suggested roles (seed; fully editable after suggestion). */
export const PACK_ROLE_SUGGESTIONS: Record<string, string[]> = {
  clinic: ['System Admin', 'Clinic Manager', 'Receptionist', 'Doctor', 'Accountant'],
  pharmacy: ['System Admin', 'Pharmacist', 'Cashier', 'Storekeeper', 'Accountant'],
  distribution: ['System Admin', 'Sales Manager', 'Sales Supervisor', 'Salesman', 'Warehouse Keeper', 'Driver', 'Accountant'],
  electrical: ['System Admin', 'Branch Manager', 'Cashier', 'Salesman', 'Warehouse Keeper', 'Accountant'],
  retail: ['System Admin', 'Branch Manager', 'Cashier', 'Storekeeper'],
};

/** Existing module keys that belong to a Core capability (everything else =
 *  an industry/vertical = a Pack). Used to split today's flat module lists. */
const CORE_MODULE_KEYS = new Set(['sales', 'inventory', 'warehousing', 'purchasing', 'accounting', 'pos']);

/** Classify an existing module key into the new grouping. */
export function classifyModuleKey(key: string): 'core' | 'pack' {
  return CORE_MODULE_KEYS.has(key) ? 'core' : 'pack';
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
  if (bt.includes('retail') || bt.includes('market') || bt.includes('supermarket') || bt.includes('wholesale')) return 'retail';
  return undefined;
}

/** Suggested roles for a business type (via its pack), or null when none. */
export function suggestedRolesForBusinessType(businessType: string): string[] | null {
  const pack = packForBusinessType(businessType);
  return pack ? (PACK_ROLE_SUGGESTIONS[pack] ?? null) : null;
}
