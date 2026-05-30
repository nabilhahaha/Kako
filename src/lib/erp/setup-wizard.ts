import type { Module } from './navigation';

/** ── Setup wizard: a declarative, per-business-type onboarding profile ──
 *
 * After a company registers, the wizard asks a few simple questions and adjusts
 * the company's enabled modules accordingly — so a one-person shop gets a lean
 * screen and a distributor with reps gets the full toolkit, all from the SAME
 * product. The whole thing is data: to enable it for another vertical, add a
 * `SETUP_PROFILES[businessType]` entry — no new screens or logic.
 *
 * How it composes: start from the business type's DEFAULT modules (seeded in
 * erp_business_type_modules), then for each answered option apply its
 * `enable` / `disable` lists. The server action persists the final set to
 * erp_company_modules. Questions are intentionally yes/no or single-choice to
 * stay fast and non-technical.
 */

export interface SetupOption {
  /** Stable id stored with the answer. */
  value: string;
  /** Bilingual label shown to the user. */
  labelAr: string;
  labelEn: string;
  /** Short helper line. */
  descAr?: string;
  descEn?: string;
  /** Modules to turn ON / OFF when this option is chosen. */
  enable?: Module[];
  disable?: Module[];
}

export interface SetupQuestion {
  id: string;
  titleAr: string;
  titleEn: string;
  /** First option is the default selection. */
  options: SetupOption[];
}

export interface SetupProfile {
  /** Intro headline for the wizard. */
  introAr: string;
  introEn: string;
  questions: SetupQuestion[];
}

// ── Electronics / electrical-supplies store (first vertical) ──────────────
// Default modules for `electronics`: accounting, inventory, pos, purchasing,
// returns, sales, warehousing. The questions trim or extend around that.
const ELECTRONICS: SetupProfile = {
  introAr: 'نظّم متجرك في خطوات بسيطة — جاوب على بعض الأسئلة ونجهّز لك الشاشات المناسبة لحجم نشاطك.',
  introEn: 'Set up your store in a few steps — answer a few questions and we tailor the screens to your size.',
  questions: [
    {
      id: 'size',
      titleAr: 'حجم نشاطك؟',
      titleEn: 'How big is your business?',
      options: [
        {
          value: 'solo',
          labelAr: 'محل صغير — بشتغل لوحدي',
          labelEn: 'Small shop — I work alone',
          descAr: 'كاشير سريع ومنتجات وتقارير يومية فقط.',
          descEn: 'Just a fast cashier, products, and daily reports.',
          disable: ['warehousing', 'distribution', 'sales_orders'],
        },
        {
          value: 'shop_store',
          labelAr: 'محل + مخزن',
          labelEn: 'Shop + a stockroom',
          descAr: 'كل ما سبق + المخزون والمشتريات والموردين.',
          descEn: 'Everything above + inventory, purchasing, suppliers.',
          enable: ['inventory', 'purchasing'],
          disable: ['distribution', 'sales_orders'],
        },
        {
          value: 'company',
          labelAr: 'شركة — فريق عمل (مدير/محاسب/كاشير/مخزن)',
          labelEn: 'Company — a team (manager/accountant/cashier/store)',
          descAr: 'كل الأدوات + الحسابات وتعدد المخازن والصلاحيات.',
          descEn: 'Full toolkit + accounting, multi-warehouse, permissions.',
          enable: ['inventory', 'purchasing', 'accounting', 'warehousing', 'sales_orders'],
          disable: ['distribution'],
        },
      ],
    },
    {
      id: 'reps',
      titleAr: 'عندك مناديب توزيع بيبيعوا برّه؟',
      titleEn: 'Do you have field sales reps?',
      options: [
        { value: 'no', labelAr: 'لا', labelEn: 'No', disable: ['distribution'] },
        {
          value: 'yes',
          labelAr: 'نعم — عندي مناديب',
          labelEn: 'Yes — I have reps',
          descAr: 'يفعّل تطبيق المندوب وخطوط السير والتحصيل الميداني.',
          descEn: 'Enables the rep app, routes, and field collection.',
          enable: ['distribution', 'sales_orders'],
        },
      ],
    },
    {
      id: 'wholesale',
      titleAr: 'بتبيع جملة بأسعار مختلفة حسب العميل؟',
      titleEn: 'Do you sell wholesale with tiered prices?',
      options: [
        { value: 'no', labelAr: 'لا — أسعار موحّدة', labelEn: 'No — single pricing', disable: ['wholesale'] },
        {
          value: 'yes',
          labelAr: 'نعم — مستويات أسعار (جملة/نص جملة/قطاعي)',
          labelEn: 'Yes — price tiers (wholesale/semi/retail)',
          enable: ['wholesale'],
        },
      ],
    },
  ],
};

/** Business types that have a setup wizard. Add an entry to enable it for a new
 *  vertical — everything else (screens, server action) stays the same. */
export const SETUP_PROFILES: Partial<Record<string, SetupProfile>> = {
  electronics: ELECTRONICS,
};

export function getSetupProfile(businessType: string | null | undefined): SetupProfile | null {
  if (!businessType) return null;
  return SETUP_PROFILES[businessType] ?? null;
}

/** Resolve answers → the final enable / disable sets to apply on top of the
 *  business type's defaults. Later answers win on conflicts. */
export function resolveModuleChanges(
  profile: SetupProfile,
  answers: Record<string, string>,
): { enable: Module[]; disable: Module[] } {
  const enable = new Set<Module>();
  const disable = new Set<Module>();
  for (const q of profile.questions) {
    const chosen = answers[q.id] ?? q.options[0]?.value;
    const opt = q.options.find((o) => o.value === chosen);
    if (!opt) continue;
    for (const m of opt.enable ?? []) {
      enable.add(m);
      disable.delete(m);
    }
    for (const m of opt.disable ?? []) {
      disable.add(m);
      enable.delete(m);
    }
  }
  return { enable: [...enable], disable: [...disable] };
}
