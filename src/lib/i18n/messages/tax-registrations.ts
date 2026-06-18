/** Tax Registrations messages. Business-friendly per the Back Office UX standard
 *  (no "legal entity" jargon — that's auto-provisioned). Keep ar/en key sets
 *  identical. */
export const ar = {
  taxReg: {
    pageTitle: 'التسجيلات الضريبية',
    pageDescription: 'سجّل أرقام التسجيل الضريبي لشركتك (ضريبة القيمة المضافة وغيرها).',
    adminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',

    add: 'إضافة تسجيل ضريبي',
    edit: 'تعديل',
    delete: 'حذف',
    default: 'الافتراضي',
    confirmDelete: 'حذف هذا التسجيل الضريبي؟',

    newTitle: 'تسجيل ضريبي جديد',
    editTitle: 'تعديل التسجيل الضريبي',
    kindLabel: 'نوع الضريبة',
    country: 'الدولة',
    selectCountry: 'اختر الدولة…',
    number: 'رقم التسجيل',
    from: 'ساري من',
    to: 'ساري حتى',
    setDefault: 'اجعله التسجيل الافتراضي',
    save: 'حفظ',
    cancel: 'إلغاء',

    kind: { vat: 'ضريبة القيمة المضافة', wht: 'ضريبة الاستقطاع', gst: 'ضريبة السلع والخدمات', sales_tax: 'ضريبة المبيعات' },

    emptyTitle: 'لا توجد تسجيلات ضريبية بعد',
    emptyDescription: 'أضف رقم التسجيل الضريبي لشركتك ليظهر على المستندات.',

    toast: { saved: 'تم حفظ التسجيل الضريبي', deleted: 'تم الحذف' },
    err: {
      generic: 'حدث خطأ',
      country_required: 'الدولة مطلوبة.',
      number_required: 'رقم التسجيل مطلوب.',
      bad_kind: 'نوع ضريبة غير معروف.',
      bad_dates: 'تاريخ الانتهاء قبل تاريخ البدء.',
      legal_entity_failed: 'تعذّر تجهيز بيانات الشركة.',
      unauthorized: 'غير مصرّح.',
    },
  },
};

export const en = {
  taxReg: {
    pageTitle: 'Tax Registrations',
    pageDescription: 'Record your company’s tax registration numbers (VAT and others).',
    adminOnly: 'This page is available to the company admin only.',

    add: 'Add tax registration',
    edit: 'Edit',
    delete: 'Delete',
    default: 'Default',
    confirmDelete: 'Delete this tax registration?',

    newTitle: 'New tax registration',
    editTitle: 'Edit tax registration',
    kindLabel: 'Tax type',
    country: 'Country',
    selectCountry: 'Choose a country…',
    number: 'Registration number',
    from: 'Effective from',
    to: 'Effective to',
    setDefault: 'Make this the default registration',
    save: 'Save',
    cancel: 'Cancel',

    kind: { vat: 'VAT', wht: 'Withholding tax', gst: 'GST', sales_tax: 'Sales tax' },

    emptyTitle: 'No tax registrations yet',
    emptyDescription: 'Add your company’s tax registration number so it appears on documents.',

    toast: { saved: 'Tax registration saved', deleted: 'Deleted' },
    err: {
      generic: 'Something went wrong',
      country_required: 'Country is required.',
      number_required: 'Registration number is required.',
      bad_kind: 'Unknown tax type.',
      bad_dates: 'End date is before the start date.',
      legal_entity_failed: 'Could not prepare company details.',
      unauthorized: 'Unauthorized.',
    },
  },
};
