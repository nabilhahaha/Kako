import type { BusinessType, BranchRole } from './types';
import type { Module } from './navigation';

/**
 * Company Onboarding — INDUSTRY PACKS (the "what business is this" layer).
 *
 * An industry pack is DECOUPLED from the permission template (the security /
 * approval model). A pack decides the vertical shape: underlying business type,
 * suggested modules, the role set, which form sections are industry-sensitive,
 * and the onboarding checklist. It does NOT decide capability grants / approval
 * limits / scope — that is the Permission Template's job (permission-templates.ts),
 * so the same pack (e.g. FMCG) can be onboarded Standard, Enterprise, or
 * Restricted. The two are composed at apply-time.
 */

export type IndustryPackId =
  | 'fmcg'
  | 'retail'
  | 'pharmacy'
  | 'clinic'
  | 'manufacturing'
  | 'services'
  | 'generic';

/** A form section that carries sensitive data in this vertical. The permission
 *  template decides HOW MUCH to lock it down (which subjects get hidden/view). */
export interface SensitiveSection {
  entity: string;
  sectionKey: string;
}

export interface OnboardingChecklistItem {
  itemKey: string;
  labelEn: string;
  labelAr: string;
  href: string | null;
  sort: number;
}

export interface IndustryPack {
  id: IndustryPackId;
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
  /** Underlying business type that drives trigger-based role/module seeding. */
  businessType: BusinessType;
  /** Modules to enable (on top of business-type defaults). */
  modules: Module[];
  /** Roles this vertical works with (must exist in the role catalog). */
  roles: BranchRole[];
  /** Industry-sensitive sections the permission template may lock down. */
  sensitiveSections: SensitiveSection[];
  /** Guided post-creation tasks. */
  checklist: OnboardingChecklistItem[];
}

// Shared checklist building blocks (pack-specific lists compose from these).
const baseChecklist = (extra: OnboardingChecklistItem[] = []): OnboardingChecklistItem[] => [
  { itemKey: 'invite_admin', labelEn: 'Invite the Company Admin', labelAr: 'دعوة مدير الشركة', href: null, sort: 10 },
  { itemKey: 'create_branches', labelEn: 'Create branches / locations', labelAr: 'إنشاء الفروع / المواقع', href: '/settings/organization', sort: 20 },
  { itemKey: 'invite_users', labelEn: 'Invite team members', labelAr: 'دعوة أعضاء الفريق', href: '/settings/users', sort: 30 },
  { itemKey: 'assign_scope', labelEn: 'Assign data scope per user (Authz Console)', labelAr: 'تحديد نطاق البيانات لكل مستخدم (وحدة الصلاحيات)', href: '/settings/authz', sort: 40 },
  { itemKey: 'review_limits', labelEn: 'Review approval limits', labelAr: 'مراجعة حدود الاعتماد', href: '/settings/authz', sort: 50 },
  ...extra,
];

export const INDUSTRY_PACKS: Record<IndustryPackId, IndustryPack> = {
  fmcg: {
    id: 'fmcg',
    labelEn: 'FMCG Distribution',
    labelAr: 'توزيع السلع الاستهلاكية',
    descriptionEn: 'Field sales, routes, vans, distribution hierarchy.',
    descriptionAr: 'مبيعات ميدانية، خطوط سير، مركبات، هيكل توزيع.',
    businessType: 'wholesale',
    modules: ['sales', 'inventory', 'purchasing', 'accounting', 'crm', 'distribution', 'field_ops', 'warehousing', 'wholesale', 'analytics', 'workflow', 'returns', 'sales_orders'],
    roles: ['admin', 'sales_director', 'regional_manager', 'branch_manager', 'supervisor', 'salesman', 'warehouse_keeper', 'accountant', 'trade_marketing_manager'],
    sensitiveSections: [
      { entity: 'customer', sectionKey: 'financial' },
      { entity: 'customer', sectionKey: 'pricing' },
      { entity: 'product', sectionKey: 'cost' },
    ],
    checklist: baseChecklist([
      { itemKey: 'setup_geo', labelEn: 'Set up regions, areas & routes', labelAr: 'إعداد المناطق والمساحات وخطوط السير', href: '/settings/organization', sort: 25 },
      { itemKey: 'import_customers', labelEn: 'Import customers', labelAr: 'استيراد العملاء', href: '/settings/import', sort: 60 },
      { itemKey: 'import_products', labelEn: 'Import products & price lists', labelAr: 'استيراد المنتجات وقوائم الأسعار', href: '/settings/import', sort: 70 },
    ]),
  },
  retail: {
    id: 'retail',
    labelEn: 'Retail',
    labelAr: 'تجزئة',
    descriptionEn: 'Point of sale, store inventory, cashiers.',
    descriptionAr: 'نقاط بيع، مخزون المتجر، أمناء صناديق.',
    businessType: 'supermarket',
    modules: ['sales', 'inventory', 'purchasing', 'accounting', 'pos', 'market', 'analytics'],
    roles: ['admin', 'manager', 'accountant', 'cashier', 'warehouse_keeper', 'salesman'],
    sensitiveSections: [
      { entity: 'product', sectionKey: 'cost' },
      { entity: 'customer', sectionKey: 'financial' },
    ],
    checklist: baseChecklist([
      { itemKey: 'import_products', labelEn: 'Import products & barcodes', labelAr: 'استيراد المنتجات والباركود', href: '/settings/import', sort: 60 },
    ]),
  },
  pharmacy: {
    id: 'pharmacy',
    labelEn: 'Pharmacy',
    labelAr: 'صيدلية',
    descriptionEn: 'Dispensing, controlled drugs, batch & expiry.',
    descriptionAr: 'صرف الأدوية، الأدوية المراقبة، التشغيلات والصلاحية.',
    businessType: 'pharmacy',
    modules: ['sales', 'inventory', 'purchasing', 'accounting', 'pos', 'pharmacy', 'analytics'],
    roles: ['admin', 'manager', 'accountant', 'cashier', 'warehouse_keeper', 'viewer'],
    sensitiveSections: [
      { entity: 'product', sectionKey: 'cost' },
      { entity: 'customer', sectionKey: 'financial' },
    ],
    checklist: baseChecklist([
      { itemKey: 'import_products', labelEn: 'Import drug catalogue', labelAr: 'استيراد كتالوج الأدوية', href: '/settings/import', sort: 60 },
    ]),
  },
  clinic: {
    id: 'clinic',
    labelEn: 'Clinic / Healthcare',
    labelAr: 'عيادة / رعاية صحية',
    descriptionEn: 'Appointments, patient files, prescriptions, billing.',
    descriptionAr: 'مواعيد، ملفات المرضى، روشتات، فوترة.',
    businessType: 'clinic',
    modules: ['clinic', 'accounting', 'inventory', 'analytics'],
    roles: ['admin', 'manager', 'accountant', 'doctor', 'receptionist', 'cashier'],
    sensitiveSections: [
      { entity: 'customer', sectionKey: 'clinical' },
      { entity: 'customer', sectionKey: 'financial' },
    ],
    checklist: baseChecklist([
      { itemKey: 'setup_services', labelEn: 'Configure services & fees', labelAr: 'إعداد الخدمات والرسوم', href: '/clinic', sort: 60 },
    ]),
  },
  manufacturing: {
    id: 'manufacturing',
    labelEn: 'Manufacturing',
    labelAr: 'تصنيع',
    descriptionEn: 'Production inputs, inventory, purchasing, costing.',
    descriptionAr: 'مدخلات الإنتاج، المخزون، المشتريات، التكلفة.',
    businessType: 'general',
    modules: ['inventory', 'purchasing', 'accounting', 'sales', 'warehousing', 'analytics', 'workflow'],
    roles: ['admin', 'manager', 'accountant', 'warehouse_keeper', 'supervisor', 'salesman'],
    sensitiveSections: [
      { entity: 'product', sectionKey: 'cost' },
    ],
    checklist: baseChecklist([
      { itemKey: 'import_products', labelEn: 'Import raw materials & finished goods', labelAr: 'استيراد المواد الخام والمنتجات', href: '/settings/import', sort: 60 },
    ]),
  },
  services: {
    id: 'services',
    labelEn: 'Services',
    labelAr: 'خدمات',
    descriptionEn: 'Service delivery, invoicing, light inventory.',
    descriptionAr: 'تقديم الخدمات، الفوترة، مخزون بسيط.',
    businessType: 'services',
    modules: ['sales', 'accounting', 'crm', 'analytics'],
    roles: ['admin', 'manager', 'accountant', 'staff', 'viewer'],
    sensitiveSections: [
      { entity: 'customer', sectionKey: 'financial' },
    ],
    checklist: baseChecklist(),
  },
  generic: {
    id: 'generic',
    labelEn: 'Generic Business',
    labelAr: 'نشاط عام',
    descriptionEn: 'A neutral starting point with the core modules.',
    descriptionAr: 'نقطة بداية محايدة مع الوحدات الأساسية.',
    businessType: 'general',
    modules: ['sales', 'inventory', 'purchasing', 'accounting'],
    roles: ['admin', 'manager', 'accountant', 'salesman', 'warehouse_keeper', 'viewer'],
    sensitiveSections: [
      { entity: 'customer', sectionKey: 'financial' },
    ],
    checklist: baseChecklist(),
  },
};

export const INDUSTRY_PACK_IDS = Object.keys(INDUSTRY_PACKS) as IndustryPackId[];

export function getIndustryPack(id: string): IndustryPack | null {
  return (INDUSTRY_PACKS as Record<string, IndustryPack>)[id] ?? null;
}
