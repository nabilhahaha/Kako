/** Platform owner "Activity Feed" — the friendly, digestible cross-tenant
 *  stream of what's happening (distinct from the forensic Audit Log). ar/en
 *  key sets are kept identical (parity test enforces this). */
export const ar = {
  activity: {
    title: 'سجل النشاط',
    description: 'لمحة سريعة عمّا يحدث عبر المنصّة. للتحقيق التفصيلي استخدم سجل التدقيق.',
    // top summary (Attention layer)
    summaryToday: '{n} حدثًا اليوم',
    summaryWeek: '{n} هذا الأسبوع',
    summarySeparator: ' · ',
    statToday: 'أحداث اليوم',
    statWeek: 'هذا الأسبوع',
    // primary affordance + cross-link to Audit
    viewFullAudit: 'عرض سجل التدقيق الكامل',
    // date scope (the closest thing to a primary action)
    scopeToday: 'اليوم',
    scope7d: 'آخر ٧ أيام',
    scope30d: 'آخر ٣٠ يوم',
    scopeAll: 'كل الفترات',
    scopeLabel: 'الفترة',
    // lean filters
    searchPlaceholder: 'ابحث بالمنفّذ أو العنصر أو التفاصيل…',
    filterEntityAll: 'كل العناصر',
    filterCompanyAll: 'كل الشركات',
    // day grouping
    dayToday: 'اليوم',
    dayYesterday: 'أمس',
    // empty states
    empty: 'لا يوجد نشاط بعد.',
    emptyHint: 'ستظهر هنا العمليات عبر المنصّة فور حدوثها.',
    noResults: 'لا يوجد نشاط مطابق.',
    noResultsHint: 'جرّب توسيع الفترة أو تعديل الفلاتر.',
    // chips / labels
    platformLabel: 'المنصّة',
    detailsToggle: 'تفاصيل',
  },
};

export const en = {
  activity: {
    title: 'Activity Feed',
    description: 'A quick look at what is happening across the platform. For forensic detail use the Audit Log.',
    // top summary (Attention layer)
    summaryToday: '{n} events today',
    summaryWeek: '{n} this week',
    summarySeparator: ' · ',
    statToday: 'Events today',
    statWeek: 'This week',
    // primary affordance + cross-link to Audit
    viewFullAudit: 'View full audit log',
    // date scope (the closest thing to a primary action)
    scopeToday: 'Today',
    scope7d: 'Last 7 days',
    scope30d: 'Last 30 days',
    scopeAll: 'All time',
    scopeLabel: 'Period',
    // lean filters
    searchPlaceholder: 'Search actor, entity or details…',
    filterEntityAll: 'All entities',
    filterCompanyAll: 'All companies',
    // day grouping
    dayToday: 'Today',
    dayYesterday: 'Yesterday',
    // empty states
    empty: 'No activity yet.',
    emptyHint: 'Operations across the platform will appear here as they happen.',
    noResults: 'No matching activity.',
    noResultsHint: 'Try widening the period or adjusting the filters.',
    // chips / labels
    platformLabel: 'Platform',
    detailsToggle: 'Details',
  },
};
