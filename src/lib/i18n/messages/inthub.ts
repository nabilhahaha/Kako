/** Integration Hub / Data Migration Center. ar = source of truth; en mirrors
 *  EXACTLY (i18n parity test enforces identical keys). */
export const ar = {
  inthub: {
    title: 'مركز نقل البيانات',
    subtitle: 'استيراد البيانات، التكاملات، والمتابعة — في مكان واحد.',
    // monitoring KPIs
    jobs: 'عمليات الاستيراد',
    successRate: 'نسبة النجاح',
    failed: 'فاشلة',
    rowsImported: 'صفوف مُستوردة',
    // recent
    recent: 'آخر عمليات الاستيراد',
    noJobs: 'لا توجد عمليات استيراد بعد.',
    rows: 'صف',
    open: 'فتح',
    // areas
    areas: {
      importWizard: { t: 'معالج الاستيراد', d: 'استيراد Excel/CSV لأي كيان مع مطابقة الأعمدة والتحقق والمعاينة.' },
      dataOnboarding: { t: 'إدخال البيانات', d: 'تهيئة بيانات الشركة: العملاء والمنتجات والمستخدمون وخطوط السير.' },
      connections: { t: 'الاتصالات', d: 'موصّلات الأنظمة الخارجية (واجهات/قواعد بيانات مستقبلية).' },
      apiKeys: { t: 'مفاتيح API', d: 'مفاتيح الوصول البرمجي للتكاملات.' },
      webhooks: { t: 'Webhooks', d: 'إشعارات فورية للأحداث للأنظمة الخارجية.' },
      sync: { t: 'سجلّات المزامنة', d: 'متابعة عمليات المزامنة والأخطاء.' },
    },
  },
};

export const en = {
  inthub: {
    title: 'Data Migration Center',
    subtitle: 'Data import, integrations, and monitoring — in one place.',
    jobs: 'Import jobs',
    successRate: 'Success rate',
    failed: 'Failed',
    rowsImported: 'Rows imported',
    recent: 'Recent imports',
    noJobs: 'No import jobs yet.',
    rows: 'rows',
    open: 'Open',
    areas: {
      importWizard: { t: 'Import Wizard', d: 'Excel/CSV import for any entity with column mapping, validation and preview.' },
      dataOnboarding: { t: 'Data Onboarding', d: 'Onboard company data: customers, products, users, routes.' },
      connections: { t: 'Connections', d: 'External system connectors (future API / database).' },
      apiKeys: { t: 'API Keys', d: 'Programmatic access keys for integrations.' },
      webhooks: { t: 'Webhooks', d: 'Real-time event notifications to external systems.' },
      sync: { t: 'Sync Logs', d: 'Monitor sync runs and errors.' },
    },
  },
};
