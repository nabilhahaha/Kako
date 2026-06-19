/** Customer 360 — workbench detail labels (tabs + section titles). ar/en key
 *  sets are identical. Reuses existing customers.* / salesman.* keys for fields
 *  and quick actions; this namespace only adds the 360-specific chrome. */
export const ar = {
  customer360: {
    // Facet tabs (canonical order)
    tabOverview: 'نظرة عامة',
    tabProfile: 'الملف',
    tabStatement: 'كشف الحساب',
    tabActivity: 'النشاط',
    tabRelated: 'عناصر مرتبطة',
    tabAudit: 'سجل التدقيق',
    // Overview
    identity: 'الهوية',
    quickActions: 'إجراءات سريعة',
    // Stats
    statBalance: 'الرصيد',
    statCreditLimit: 'حد الائتمان',
    statOverdue: 'متأخرات',
    statStatus: 'الحالة',
    statInvoices: 'الفواتير',
    statRequests: 'الطلبات',
    statVisits: 'الزيارات',
    // Activity
    activityTitle: 'النشاط الموحّد',
    activityEmpty: 'لا يوجد نشاط بعد.',
    activityScope: 'مالي · طلبات العملاء · نتائج الزيارات',
    // Related
    relatedTitle: 'عناصر مرتبطة',
    relBranch: 'الفرع',
    relSalesman: 'المندوب',
    relRegion: 'المنطقة',
    relArea: 'النطاق',
    relParent: 'العميل الأب',
    relChildren: 'الفروع التابعة',
    relRoute: 'خط السير',
    relSupervisor: 'المشرف',
    relNone: 'لا توجد عناصر مرتبطة.',
    // Read-only context blocks (G1)
    commercialTitle: 'البيانات التجارية',
    territoryTitle: 'التغطية والمنطقة',
    // Section titles
    statusTitle: 'حالة الحساب',
    notesTitle: 'الملاحظات',
    auditTitle: 'سجل التدقيق',
    none: '—',
  },
};

export const en = {
  customer360: {
    tabOverview: 'Overview',
    tabProfile: 'Profile',
    tabStatement: 'Statement',
    tabActivity: 'Activity',
    tabRelated: 'Related',
    tabAudit: 'Audit',
    identity: 'Identity',
    quickActions: 'Quick actions',
    statBalance: 'Balance',
    statCreditLimit: 'Credit limit',
    statOverdue: 'Overdue',
    statStatus: 'Status',
    statInvoices: 'Invoices',
    statRequests: 'Requests',
    statVisits: 'Visits',
    activityTitle: 'Unified activity',
    activityEmpty: 'No activity yet.',
    activityScope: 'Financial · customer requests · visit outcomes',
    relatedTitle: 'Related',
    relBranch: 'Branch',
    relSalesman: 'Salesman',
    relRegion: 'Region',
    relArea: 'Area',
    relParent: 'Parent customer',
    relChildren: 'Sub-accounts',
    relRoute: 'Route',
    relSupervisor: 'Supervisor',
    relNone: 'No related records.',
    // Read-only context blocks (G1)
    commercialTitle: 'Commercial',
    territoryTitle: 'Territory & coverage',
    statusTitle: 'Account status',
    notesTitle: 'Notes',
    auditTitle: 'Audit log',
    none: '—',
  },
};
