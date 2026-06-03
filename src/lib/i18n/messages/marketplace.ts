/** App Marketplace messages. Keep ar/en keys identical. */
export const ar = {
  marketplace: {
    title: 'متجر الوحدات',
    description: 'فعّل أو أوقف وحدات النظام في أي وقت — بدون إعادة إنشاء مساحة العمل.',
    installed: 'مُفعّلة',
    enable: 'تفعيل',
    disable: 'إيقاف',
    enabled: 'تم تفعيل الوحدة',
    disabled: 'تم إيقاف الوحدة',
    error: 'تعذّر تغيير الوحدة',
    coreModules: 'الوحدات الأساسية',
    industryPacks: 'باقات القطاعات',
    // Plan-locked
    inPlan: 'ضمن خطتك',
    locked: 'ترقية',
    lockedHint: 'غير متوفرة في خطتك الحالية — ترقَّ لتفعيلها.',
    // Dependency hints (advisory only)
    needsHint: 'تعمل بشكل أفضل مع: {modules}',
    disableWarnTitle: 'إيقاف {module}؟',
    disableWarnBody: 'هذه الوحدات تعتمد عليها: {modules}. قد تتوقف بعض الشاشات عن الظهور. (تنبيه إرشادي فقط)',
    disableWarnConfirm: 'إيقاف على أي حال',
    // Reset to recommended
    resetTitle: 'إرجاع للوحدات الموصى بها',
    resetHint: 'يعيد الوحدات المفعّلة إلى الإعداد الموصى به لنشاطك.',
    resetButton: 'إرجاع للموصى به',
    resetConfirmTitle: 'إرجاع للوحدات الموصى بها؟',
    resetConfirmBody: 'سيُفعّل: {enable}\nسيُوقف: {disable}',
    resetConfirmNoChange: 'الوحدات مطابقة للموصى به بالفعل — لا تغيير.',
    resetConfirm: 'تطبيق',
    resetDone: 'تم الإرجاع للوحدات الموصى بها',
    resetNone: 'لا توجد توصية لنشاطك',
    none: '—',
  },
};

export const en = {
  marketplace: {
    title: 'App Marketplace',
    description: 'Enable or disable platform modules anytime — without recreating your workspace.',
    installed: 'Installed',
    enable: 'Enable',
    disable: 'Disable',
    enabled: 'Module enabled',
    disabled: 'Module disabled',
    error: 'Could not change the module',
    coreModules: 'Core Modules',
    industryPacks: 'Industry Packs',
    // Plan-locked
    inPlan: 'In your plan',
    locked: 'Upgrade',
    lockedHint: 'Not included in your current plan — upgrade to enable.',
    // Dependency hints (advisory only)
    needsHint: 'Works best with: {modules}',
    disableWarnTitle: 'Disable {module}?',
    disableWarnBody: 'These rely on it: {modules}. Some screens may stop appearing. (Advisory only)',
    disableWarnConfirm: 'Disable anyway',
    // Reset to recommended
    resetTitle: 'Reset to recommended',
    resetHint: 'Restores your enabled modules to the recommended set for your business.',
    resetButton: 'Reset to recommended',
    resetConfirmTitle: 'Reset to recommended modules?',
    resetConfirmBody: 'Will enable: {enable}\nWill disable: {disable}',
    resetConfirmNoChange: 'Modules already match the recommended set — nothing to change.',
    resetConfirm: 'Apply',
    resetDone: 'Reset to recommended modules',
    resetNone: 'No recommendation for your business',
    none: '—',
  },
};
