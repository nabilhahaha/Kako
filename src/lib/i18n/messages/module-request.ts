/** Tenant-side module-activation request messages. Keep ar/en in sync. */
export const ar = {
  moduleRequest: {
    title: 'طلب تفعيل وحدة',
    subtitle: 'اطلب تفعيل وحدة أو حزمة قطاعية أو التكاملات لشركتك — يخضع لاعتماد المزوّد',
    hint: 'يُراجَع الطلب ثم يعتمده مالك المنصّة، ثم تُفعَّل الوحدة. تابع الحالة من "الطلبات والموافقات".',
    adminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',
    submit: 'إرسال الطلب',
    moduleLabel: 'الوحدة المطلوبة',
    modulePlaceholder: 'اختر وحدة',
    noteLabel: 'ملاحظة',
    notePlaceholder: 'تفاصيل إضافية (اختياري)',
    toast: { sent: 'تم إرسال الطلب', error: 'تعذّر إرسال الطلب' },
    errors: { unauthorized: 'غير مصرح', adminOnly: 'متاح لمدير الشركة فقط', invalidModule: 'وحدة غير صالحة' },
  },
};

export const en = {
  moduleRequest: {
    title: 'Module activation request',
    subtitle: 'Request enabling a module, industry pack, or integrations for your company — subject to provider approval',
    hint: 'Reviewed and approved by the platform owner, then the module is enabled. Track status under "Requests & Approvals".',
    adminOnly: 'This page is available to company admins only.',
    submit: 'Submit request',
    moduleLabel: 'Requested module',
    modulePlaceholder: 'Choose a module',
    noteLabel: 'Note',
    notePlaceholder: 'Additional details (optional)',
    toast: { sent: 'Request submitted', error: 'Could not submit the request' },
    errors: { unauthorized: 'Unauthorized', adminOnly: 'Company admins only', invalidModule: 'Invalid module' },
  },
};
