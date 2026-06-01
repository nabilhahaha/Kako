/** Field Execution (field_ops) — rep-facing messages. Keep ar/en in sync. */
export const ar = {
  field: {
    sync: {
      online: 'متصل', offline: 'غير متصل',
      syncing: 'جارٍ المزامنة…', allSynced: 'تمت المزامنة', pending: 'بانتظار المزامنة',
      queued: 'في الانتظار', failed: 'فشل', syncNow: 'مزامنة الآن',
      pendingCount: '{count} عنصر بانتظار المزامنة',
      needsFix: 'عناصر تحتاج إلى تصحيح',
    },
    visits: {
      title: 'زياراتي — اليوم',
      startVisit: 'بدء زيارة', endVisit: 'إنهاء الزيارة', ending: 'جارٍ الإنهاء…',
      inProgress: 'قيد التنفيذ', completed: 'مكتملة', pendingSync: 'بانتظار المزامنة',
      noVisits: 'لا توجد زيارات اليوم', elapsed: 'منذ', min: 'دقيقة',
      pickCustomer: 'اختر العميل', search: 'بحث…', empty: 'لا يوجد عملاء',
      captureGps: 'تحديد الموقع', capturing: 'جارٍ تحديد الموقع…', recapture: 'إعادة التحديد',
      metersFromStore: 'م من المتجر', inside: 'داخل النطاق', outside: 'خارج النطاق', unknownLoc: 'موقع المتجر غير محدد',
      reason: 'سبب الخروج عن النطاق', reasonPh: 'لماذا أنت خارج منطقة المتجر؟',
      photo: 'صورة إثبات', takePhoto: 'التقاط صورة', photoTaken: 'تم التقاط الصورة ✓',
      confirm: 'تأكيد بدء الزيارة', cancel: 'إلغاء', gpsError: 'تعذّر تحديد الموقع',
      accuracy: 'الدقة', needGps: 'حدّد الموقع أولاً',
    },
    dashboard: {
      title: 'لوحة العمليات الميدانية', noAccess: 'لا تملك صلاحية الوصول إلى لوحة العمليات الميدانية.',
      today: 'اليوم', visits: 'الزيارات', completed: 'مكتملة', inProgress: 'قيد التنفيذ',
      covered: 'عملاء تمت زيارتهم', avgDuration: 'متوسط المدة', compliance: 'الالتزام بالنطاق',
      violations: 'مخالفات النطاق', alerts: 'تنبيهات بحاجة لمتابعة', noAlerts: 'لا توجد تنبيهات',
      routes: 'حسب خط السير', route: 'خط السير', noRoutes: 'لا توجد زيارات اليوم', viewCustomer: 'عرض العميل',
      min: 'دقيقة', metersFromStore: 'م',
    },
    profile: {
      title: 'ملف العميل الميداني', back: 'رجوع', rollup: 'ملخص الزيارات',
      lastVisit: 'آخر زيارة', visits30d: 'زيارات (30 يومًا)', lastGeofence: 'آخر حالة نطاق',
      lastMerch: 'آخر تدقيق رفوف', lastCompetitorPrice: 'آخر سعر منافس', never: 'لا يوجد',
      ownership: 'الملكية', accountOwner: 'مالك الحساب', routeOwner: 'مندوب الخط',
      timeline: 'سجل الزيارات', noVisits: 'لا توجد زيارات', reason: 'السبب', duration: 'المدة',
    },
  },
};

export const en = {
  field: {
    sync: {
      online: 'Online', offline: 'Offline',
      syncing: 'Syncing…', allSynced: 'All synced', pending: 'Pending sync',
      queued: 'Queued', failed: 'Failed', syncNow: 'Sync now',
      pendingCount: '{count} item(s) pending sync',
      needsFix: 'items need attention',
    },
    visits: {
      title: 'My Visits — Today',
      startVisit: 'Start visit', endVisit: 'End visit', ending: 'Ending…',
      inProgress: 'In progress', completed: 'Completed', pendingSync: 'Pending sync',
      noVisits: 'No visits today', elapsed: 'ago', min: 'min',
      pickCustomer: 'Choose customer', search: 'Search…', empty: 'No customers',
      captureGps: 'Capture location', capturing: 'Locating…', recapture: 'Re-capture',
      metersFromStore: 'm from store', inside: 'Inside geofence', outside: 'Outside geofence', unknownLoc: 'Store location not set',
      reason: 'Reason (outside geofence)', reasonPh: 'Why are you outside the store area?',
      photo: 'Exception photo', takePhoto: 'Take photo', photoTaken: 'Photo captured ✓',
      confirm: 'Confirm start', cancel: 'Cancel', gpsError: 'Could not get location',
      accuracy: 'Accuracy', needGps: 'Capture location first',
    },
    dashboard: {
      title: 'Field Dashboard', noAccess: 'You don’t have access to the Field dashboard.',
      today: 'Today', visits: 'Visits', completed: 'Completed', inProgress: 'In progress',
      covered: 'Customers covered', avgDuration: 'Avg duration', compliance: 'Geofence compliance',
      violations: 'Geofence violations', alerts: 'Alerts needing attention', noAlerts: 'No alerts',
      routes: 'By route', route: 'Route', noRoutes: 'No visits today', viewCustomer: 'View customer',
      min: 'min', metersFromStore: 'm',
    },
    profile: {
      title: 'Customer field profile', back: 'Back', rollup: 'Visit rollup',
      lastVisit: 'Last visit', visits30d: 'Visits (30d)', lastGeofence: 'Last geofence',
      lastMerch: 'Last merch audit', lastCompetitorPrice: 'Last competitor price', never: '—',
      ownership: 'Ownership', accountOwner: 'Account owner', routeOwner: 'Route owner',
      timeline: 'Visit history', noVisits: 'No visits yet', reason: 'Reason', duration: 'Duration',
    },
  },
};
