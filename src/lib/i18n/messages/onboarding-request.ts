/** Tenant-side onboarding/provisioning request messages. Keep ar/en in sync. */
export const ar = {
  onboardingRequest: {
    title: 'طلب التهيئة',
    subtitle: 'اطلب تهيئة اشتراك شركتك (الخطة والفترة التجريبية) — يخضع لاعتماد المزوّد',
    hint: 'يُراجَع الطلب من فريق التهيئة ثم يعتمده مالك المنصّة، ثم تُفعَّل الشركة على الخطة المطلوبة. تابع الحالة من "الطلبات والموافقات".',
    adminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',
    submit: 'إرسال الطلب',
    planLabel: 'الخطة',
    planPlaceholder: 'اختر خطة',
    trialDaysLabel: 'أيام التجربة',
    noteLabel: 'ملاحظة',
    notePlaceholder: 'تفاصيل إضافية (اختياري)',
    toast: { sent: 'تم إرسال الطلب', error: 'تعذّر إرسال الطلب' },
    errors: { unauthorized: 'غير مصرح', adminOnly: 'متاح لمدير الشركة فقط' },
  },
};

export const en = {
  onboardingRequest: {
    title: 'Onboarding request',
    subtitle: 'Request provisioning for your company (plan & trial) — subject to provider approval',
    hint: 'Reviewed by Onboarding and approved by the platform owner, then your company is activated on the requested plan. Track status under "Requests & Approvals".',
    adminOnly: 'This page is available to company admins only.',
    submit: 'Submit request',
    planLabel: 'Plan',
    planPlaceholder: 'Choose a plan',
    trialDaysLabel: 'Trial days',
    noteLabel: 'Note',
    notePlaceholder: 'Additional details (optional)',
    toast: { sent: 'Request submitted', error: 'Could not submit the request' },
    errors: { unauthorized: 'Unauthorized', adminOnly: 'Company admins only' },
  },
};
