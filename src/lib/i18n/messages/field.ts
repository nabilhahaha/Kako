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
  },
};
