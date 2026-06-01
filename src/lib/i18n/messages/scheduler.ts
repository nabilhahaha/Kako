/** Scheduler health dashboard (PR-2) — admin messages. Keep ar/en in sync. */
export const ar = {
  scheduler: {
    title: 'المهام المجدولة', noAccess: 'يتطلب صلاحية مدير الشركة.', empty: 'لا توجد مهام', ensure: 'تهيئة المهام الافتراضية',
    job: 'المهمة', enabled: 'مُفعّلة', critical: 'حرجة', lastRun: 'آخر تشغيل', nextRun: 'التشغيل التالي', status: 'الحالة',
    duration: 'المدة', interval: 'كل (دقيقة)', error: 'الخطأ', stale: 'متأخرة', runNow: 'تشغيل الآن', running: 'جارٍ…',
    ran: 'تم التشغيل ✓', runFailed: 'فشل التشغيل', enable: 'تفعيل', disable: 'تعطيل', recentRuns: 'آخر عمليات التشغيل',
    st: { ok: 'ناجحة', failed: 'فاشلة', running: 'قيد التشغيل', none: 'لم تُشغّل بعد' },
  },
};
export const en = {
  scheduler: {
    title: 'Scheduled jobs', noAccess: 'Requires company admin.', empty: 'No jobs', ensure: 'Set up default jobs',
    job: 'Job', enabled: 'Enabled', critical: 'Critical', lastRun: 'Last run', nextRun: 'Next run', status: 'Status',
    duration: 'Duration', interval: 'Every (min)', error: 'Error', stale: 'Stale', runNow: 'Run now', running: 'Running…',
    ran: 'Ran ✓', runFailed: 'Run failed', enable: 'Enable', disable: 'Disable', recentRuns: 'Recent runs',
    st: { ok: 'OK', failed: 'Failed', running: 'Running', none: 'Not run yet' },
  },
};
