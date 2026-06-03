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

  // Per-company operational analytics (platform owner views ONE company) —
  // read-only aggregates: sales, AR, collections, top customers/products, route
  // coverage, new vs returning. All amounts in the company's own currency.
  companyAnalytics: {
    title: 'تحليلات الشركة',
    description: 'نظرة تشغيلية على مبيعات الشركة وتحصيلاتها وعملائها ومنتجاتها وتغطية المندوبين.',
    backToCompany: 'العودة إلى ملف الشركة',
    viewAnalytics: 'عرض التحليلات',
    currencyNote: 'كل المبالغ بعملة الشركة ({currency}).',

    // T1 KPIs
    kpiTitle: 'المؤشرات الرئيسية',
    kpiSalesMonth: 'مبيعات هذا الشهر',
    kpiArOutstanding: 'الذمم المدينة القائمة',
    kpiActiveCustomers: 'العملاء النشطون',
    kpiCollectionRate: 'معدّل التحصيل',
    kpiActiveCustomersHint: 'عملاء لديهم فاتورة واحدة على الأقل ضمن النطاق',

    // sales over time
    salesTitle: 'المبيعات خلال آخر ٦ أشهر',
    salesSubtitle: 'صافي المبيعات لكل شهر',
    salesEmpty: 'لا توجد بيانات مبيعات.',
    salesUnit: 'مبيعات',

    // collections over time
    collectionsTitle: 'التحصيلات عبر الزمن',
    collectionsSubtitle: 'المدفوعات المستلمة لكل شهر',
    collectionsEmpty: 'لا توجد بيانات تحصيل.',
    collectionsUnit: 'تحصيلات',

    // top customers
    topCustomersTitle: 'أبرز العملاء',
    topCustomersSubtitle: 'حسب صافي المبيعات ضمن النطاق',
    topCustomersEmpty: 'لا يوجد عملاء لعرضهم.',

    // top products
    topProductsTitle: 'أبرز المنتجات',
    topProductsSubtitle: 'حسب الإيراد ضمن النطاق',
    topProductsEmpty: 'لا توجد منتجات لعرضها.',

    // route coverage (FMCG visits)
    coverageTitle: 'تغطية المندوبين',
    coverageSubtitle: 'الزيارات والمكالمات المنتجة ومعدّل النجاح ضمن النطاق',
    coverageEmpty: 'لا توجد بيانات زيارات.',
    coverageVisits: 'إجمالي الزيارات',
    coverageProductive: 'مكالمات منتجة',
    coverageStrikeRate: 'معدّل النجاح',
    coverageVisitedCustomers: 'عملاء تمت زيارتهم',

    // new vs returning
    newReturningTitle: 'عملاء جدد مقابل عائدين',
    newReturningSubtitle: 'العملاء المُنشأون ضمن النطاق مقابل العملاء القائمين النشطين',
    newReturningEmpty: 'لا يوجد نشاط للعملاء ضمن النطاق.',
    newCustomers: 'عملاء جدد',
    returningCustomers: 'عملاء عائدون',

    // units / generic
    customersUnit: 'عميل',
    productsUnit: 'منتج',
    sectionUnavailable: 'البيانات غير متاحة حاليًا.',
    noBranches: 'لا توجد فروع لهذه الشركة، لذا لا تتوفر تحليلات تشغيلية.',
    ownerOnly: 'هذه الصفحة متاحة لمالك المنصّة فقط.',
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

  companyAnalytics: {
    title: 'Company Analytics',
    description: 'An operational view of this company’s sales, collections, customers, products and route coverage.',
    backToCompany: 'Back to company',
    viewAnalytics: 'View analytics',
    currencyNote: 'All amounts are in the company’s currency ({currency}).',

    kpiTitle: 'Headline metrics',
    kpiSalesMonth: 'Sales this month',
    kpiArOutstanding: 'AR outstanding',
    kpiActiveCustomers: 'Active customers',
    kpiCollectionRate: 'Collection rate',
    kpiActiveCustomersHint: 'Customers with at least one invoice in the window',

    salesTitle: 'Sales over last 6 months',
    salesSubtitle: 'Net sales per month',
    salesEmpty: 'No sales data.',
    salesUnit: 'sales',

    collectionsTitle: 'Collections over time',
    collectionsSubtitle: 'Payments received per month',
    collectionsEmpty: 'No collections data.',
    collectionsUnit: 'collected',

    topCustomersTitle: 'Top customers',
    topCustomersSubtitle: 'By net sales within the window',
    topCustomersEmpty: 'No customers to show.',

    topProductsTitle: 'Top products',
    topProductsSubtitle: 'By revenue within the window',
    topProductsEmpty: 'No products to show.',

    coverageTitle: 'Route coverage',
    coverageSubtitle: 'Visits, productive calls and strike rate within the window',
    coverageEmpty: 'No visit data.',
    coverageVisits: 'Total visits',
    coverageProductive: 'Productive calls',
    coverageStrikeRate: 'Strike rate',
    coverageVisitedCustomers: 'Customers visited',

    newReturningTitle: 'New vs returning customers',
    newReturningSubtitle: 'Customers created in the window vs existing active customers',
    newReturningEmpty: 'No customer activity in the window.',
    newCustomers: 'New customers',
    returningCustomers: 'Returning customers',

    customersUnit: 'customers',
    productsUnit: 'products',
    sectionUnavailable: 'Data is currently unavailable.',
    noBranches: 'This company has no branches, so operational analytics are unavailable.',
    ownerOnly: 'This page is available to the platform owner only.',
  },
} as const;
