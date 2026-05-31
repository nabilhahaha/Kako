/** Platform Staff Management UI messages. ar/en keys identical. Namespace: platformStaff */
export const ar = {
  platformStaff: {
    title: 'موظفو المنصة',
    subtitle: 'إدارة موظفي المنصة الداخليين وأدوارهم وصلاحياتهم.',
    ownerOnly: 'هذه الصفحة متاحة لمالك المنصة أو من يملك صلاحية إدارة المستخدمين.',
    empty: 'لا يوجد موظفون بعد.',
    columns: {
      employee: 'الموظف',
      email: 'البريد',
      role: 'الدور',
      status: 'الحالة',
      permissions: 'الصلاحيات',
      actions: 'إجراءات',
    },
    status: {
      active: 'نشط',
      disabled: 'معطّل',
    },
    create: {
      title: 'إضافة موظف',
      email: 'البريد الإلكتروني',
      fullName: 'الاسم الكامل',
      password: 'كلمة المرور المؤقتة',
      role: 'الدور',
      jobTitle: 'المسمى الوظيفي (اختياري)',
      submit: 'إنشاء',
      success: 'تم إنشاء الموظف',
      ownerOnlyNote: 'دعوة موظف جديد متاحة لمالك المنصة فقط.',
    },
    roleChange: {
      label: 'تغيير الدور',
      success: 'تم تحديث الدور',
    },
    overrides: {
      title: 'تجاوزات الصلاحيات',
      grant: 'منح',
      deny: 'منع',
      default: 'افتراضي',
      none: 'بدون تجاوز',
      hint: 'التجاوزات تُضاف فوق صلاحيات الدور الافتراضية.',
    },
    offboard: {
      action: 'إيقاف الوصول',
      confirm: 'إيقاف وصول هذا الموظف؟ سيتم تعطيل تسجيل الدخول وإنهاء الجلسات دون المساس ببيانات العملاء.',
      success: 'تم إيقاف وصول الموظف',
      reactivate: 'إعادة التفعيل',
      reactivateSuccess: 'تمت إعادة تفعيل الموظف',
      note: 'الإيقاف يعطّل الدخول والجلسات النشطة فقط، ولا يحذف أي بيانات.',
    },
    toast: {
      error: 'حدث خطأ',
      saved: 'تم الحفظ',
    },
  },
};

export const en = {
  platformStaff: {
    title: 'Platform Staff',
    subtitle: 'Manage internal platform employees, their roles and permissions.',
    ownerOnly: 'This page requires Platform Owner or the Manage Users permission.',
    empty: 'No staff yet.',
    columns: {
      employee: 'Employee',
      email: 'Email',
      role: 'Role',
      status: 'Status',
      permissions: 'Permissions',
      actions: 'Actions',
    },
    status: {
      active: 'Active',
      disabled: 'Disabled',
    },
    create: {
      title: 'Add employee',
      email: 'Email',
      fullName: 'Full name',
      password: 'Temporary password',
      role: 'Role',
      jobTitle: 'Job title (optional)',
      submit: 'Create',
      success: 'Employee created',
      ownerOnlyNote: 'Inviting a new employee is restricted to the Platform Owner.',
    },
    roleChange: {
      label: 'Change role',
      success: 'Role updated',
    },
    overrides: {
      title: 'Permission overrides',
      grant: 'Grant',
      deny: 'Deny',
      default: 'Default',
      none: 'No override',
      hint: "Overrides apply on top of the role's default permissions.",
    },
    offboard: {
      action: 'Offboard',
      confirm: 'Offboard this employee? Their login and sessions will be disabled without affecting customer data.',
      success: 'Employee access disabled',
      reactivate: 'Reactivate',
      reactivateSuccess: 'Employee reactivated',
      note: 'Offboarding only disables login and active sessions; no data is deleted.',
    },
    toast: {
      error: 'Something went wrong',
      saved: 'Saved',
    },
  },
};
