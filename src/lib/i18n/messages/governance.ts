/** Configuration Governance (CG-2) — admin console messages. Keep ar/en in sync. */
export const ar = {
  governance: {
    title: 'حوكمة الإعدادات', noAccess: 'يتطلب صلاحية مدير الشركة.', back: 'الحوكمة', empty: 'لا توجد تغييرات',
    new: 'تغيير جديد', name: 'العنوان', configType: 'نوع الإعداد', configRef: 'المفتاح', enabled: 'مُفعّل', kind: 'النوع',
    create: 'إنشاء', save: 'حفظ', saved: 'تم الحفظ ✓', saveFailed: 'تعذّر الحفظ', actionFailed: 'تعذّر تنفيذ الإجراء',
    kindFeature: 'ميزة', kindModule: 'وحدة',
    cards: { draft: 'مسودة', review: 'قيد المراجعة', approved: 'معتمد', published: 'منشور', rolled_back: 'مُتراجع عنه' },
    st: { draft: 'مسودة', review: 'مراجعة', approved: 'معتمد', published: 'منشور', rolled_back: 'متراجع عنه' },
    actions: { review: 'إرسال للمراجعة', approve: 'اعتماد', publish: 'نشر', rollback: 'تراجع', newVersion: 'نسخة جديدة' },
    audience: { title: 'الجمهور', kind: 'النطاق', ids: 'المعرّفات (مفصولة بفواصل)',
      all: 'كل المستخدمين', role: 'أدوار', region: 'أقاليم', branch: 'فروع', route: 'خطوط سير', team: 'فرق', user: 'مستخدمون' },
    pilot: { title: 'مستخدمو التجربة', hint: 'معرّفات مستخدمين للمعاينة قبل النشر (مفصولة بفواصل)' },
    timeline: { title: 'سجل التدقيق', created: 'أُنشئ', modified: 'عُدّل', reviewed: 'روجع', approved: 'اعتُمد', published: 'نُشر', rolled_back: 'تراجع' },
    impact: { title: 'أثر النشر', users: 'المستخدمون المتأثرون', roles: 'الأدوار', branches: 'الفروع', routes: 'خطوط السير', regions: 'الأقاليم', modules: 'الوحدات', sample: 'أمثلة' },
    rollbackPreview: { title: 'معاينة التراجع', current: 'الحالي', revertsTo: 'سيعود إلى', removes: 'سيُزال الإعداد بالكامل', version: 'إصدار' },
    conflicts: { title: 'تعارضات', none: 'لا تعارضات' },
  },
};
export const en = {
  governance: {
    title: 'Configuration Governance', noAccess: 'Requires company admin.', back: 'Governance', empty: 'No changes',
    new: 'New change', name: 'Title', configType: 'Config type', configRef: 'Key', enabled: 'Enabled', kind: 'Kind',
    create: 'Create', save: 'Save', saved: 'Saved ✓', saveFailed: 'Could not save', actionFailed: 'Action failed',
    kindFeature: 'Feature', kindModule: 'Module',
    cards: { draft: 'Draft', review: 'In review', approved: 'Approved', published: 'Published', rolled_back: 'Rolled back' },
    st: { draft: 'Draft', review: 'Review', approved: 'Approved', published: 'Published', rolled_back: 'Rolled back' },
    actions: { review: 'Submit for review', approve: 'Approve', publish: 'Publish', rollback: 'Rollback', newVersion: 'New version' },
    audience: { title: 'Audience', kind: 'Scope', ids: 'IDs (comma-separated)',
      all: 'All users', role: 'Roles', region: 'Regions', branch: 'Branches', route: 'Routes', team: 'Teams', user: 'Users' },
    pilot: { title: 'Pilot users', hint: 'User IDs who can preview before publish (comma-separated)' },
    timeline: { title: 'Audit timeline', created: 'Created', modified: 'Modified', reviewed: 'Reviewed', approved: 'Approved', published: 'Published', rolled_back: 'Rolled back' },
    impact: { title: 'Publish impact', users: 'Affected users', roles: 'Roles', branches: 'Branches', routes: 'Routes', regions: 'Regions', modules: 'Modules', sample: 'Sample' },
    rollbackPreview: { title: 'Rollback preview', current: 'Current', revertsTo: 'Reverts to', removes: 'Will remove the config entirely', version: 'version' },
    conflicts: { title: 'Conflicts', none: 'No conflicts' },
  },
};
