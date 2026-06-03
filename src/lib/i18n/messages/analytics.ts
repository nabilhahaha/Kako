/** Platform Analytics Dashboard (platform owner) — read-only cross-tenant
 *  aggregates: growth, subscription mix, per-currency revenue, module adoption,
 *  business-type distribution. ar/en key sets are kept identical (parity test
 *  enforces this). */
export const ar = {
  platformAnalytics: {
    title: 'تحليلات المنصّة',
    description: 'نظرة شاملة على نمو الشركات واشتراكاتها والإيرادات وتبنّي الوحدات عبر المنصّة.',
    ownerOnly: 'هذه الصفحة متاحة لمالك المنصّة فقط.',

    // primary affordance — growth window selector
    rangeLabel: 'نطاق النمو',
    range30: '٣٠ يومًا',
    range90: '٩٠ يومًا',
    range180: '١٨٠ يومًا',

    // cross-links to deeper screens
    openCompanies: 'فتح الشركات',
    openBilling: 'فتح الفوترة',

    // T1 headline KPIs
    kpiTitle: 'المؤشرات الرئيسية',
    statTotalCompanies: 'إجمالي الشركات',
    statActive: 'نشطة',
    statTrial: 'تجريبية',
    statExpiring: 'قاربت الانتهاء',
    statExpired: 'منتهية / موقوفة',
    statTotalUsers: 'إجمالي المستخدمين',
    statTotalBranches: 'إجمالي الفروع',

    // growth
    growthTitle: 'الاشتراكات الجديدة (الشركات)',
    growthSubtitle: 'عدد الشركات الجديدة لكل شهر خلال النطاق المحدد',
    growthEmpty: 'لا توجد بيانات نمو ضمن هذا النطاق.',
    newCompanies: 'شركة جديدة',

    // subscription mix
    mixTitle: 'توزيع حالات الاشتراك',
    mixSubtitle: 'تصنيف الشركات حسب حالة الاشتراك الحالية',
    mixEmpty: 'لا توجد شركات لعرض التوزيع.',
    mix_active: 'نشط',
    mix_trial: 'تجريبي',
    mix_expired: 'منتهي',
    mix_suspended: 'موقوف',
    mix_cancelled: 'ملغي',

    // revenue (per-currency only)
    revenueTitle: 'الإيرادات الشهرية المتكرّرة (لكل عملة)',
    revenueSubtitle: 'قيمة الاشتراكات النشطة شهريًا، معروضة لكل عملة على حدة (لا يتم جمع العملات).',
    revenueEmpty: 'لا توجد اشتراكات مدفوعة نشطة لاحتساب الإيراد.',
    revenueFallbackNote: 'تعذّر اشتقاق الإيراد بشكل موثوق من الأسعار، لذا نعرض عدد الاشتراكات المدفوعة النشطة بدلًا منه.',
    revenuePaidSubs: 'اشتراكات مدفوعة نشطة',
    revenuePerMonth: '/ شهريًا',

    // module adoption
    modulesTitle: 'تبنّي الوحدات',
    modulesSubtitle: 'أكثر الوحدات تفعيلًا عبر الشركات',
    modulesEmpty: 'لا توجد وحدات مفعّلة.',
    companiesUnit: 'شركة',

    // business-type distribution
    typesTitle: 'توزيع أنواع الأنشطة',
    typesSubtitle: 'تصنيف الشركات حسب نوع النشاط',
    typesEmpty: 'لا توجد شركات لعرض التوزيع.',
    typeUnknown: 'غير محدد',

    // graceful degradation
    sectionUnavailable: 'البيانات غير متاحة حاليًا.',
  },
} as const;

export const en = {
  platformAnalytics: {
    title: 'Platform Analytics',
    description: 'A bird’s-eye view of company growth, subscriptions, revenue and module adoption across the platform.',
    ownerOnly: 'This page is available to the platform owner only.',

    rangeLabel: 'Growth window',
    range30: '30 days',
    range90: '90 days',
    range180: '180 days',

    openCompanies: 'Open Companies',
    openBilling: 'Open Billing',

    kpiTitle: 'Headline metrics',
    statTotalCompanies: 'Total companies',
    statActive: 'Active',
    statTrial: 'Trial',
    statExpiring: 'Expiring',
    statExpired: 'Expired / suspended',
    statTotalUsers: 'Total users',
    statTotalBranches: 'Total branches',

    growthTitle: 'New companies (signups)',
    growthSubtitle: 'Company signups per month over the selected window',
    growthEmpty: 'No growth data within this window.',
    newCompanies: 'new companies',

    mixTitle: 'Subscription mix',
    mixSubtitle: 'Companies broken down by current subscription state',
    mixEmpty: 'No companies to break down.',
    mix_active: 'Active',
    mix_trial: 'Trial',
    mix_expired: 'Expired',
    mix_suspended: 'Suspended',
    mix_cancelled: 'Cancelled',

    revenueTitle: 'Recurring revenue (per currency)',
    revenueSubtitle: 'Monthly value of active subscriptions, shown per currency (currencies are never summed together).',
    revenueEmpty: 'No active paid subscriptions to derive revenue.',
    revenueFallbackNote: 'Revenue could not be cleanly derived from prices, so the count of active paid subscriptions is shown instead.',
    revenuePaidSubs: 'active paid subscriptions',
    revenuePerMonth: '/ mo',

    modulesTitle: 'Module adoption',
    modulesSubtitle: 'Most-enabled modules across companies',
    modulesEmpty: 'No enabled modules.',
    companiesUnit: 'companies',

    typesTitle: 'Business-type distribution',
    typesSubtitle: 'Companies broken down by business type',
    typesEmpty: 'No companies to break down.',
    typeUnknown: 'Unspecified',

    sectionUnavailable: 'Data is currently unavailable.',
  },
} as const;
