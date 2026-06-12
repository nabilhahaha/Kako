/** pharmacy module messages – ar values are the original Arabic; en values are professional English translations. */

export const ar = {
  pharmacy: {
    // ── Page ─────────────────────────────────────────────────────────────
    pageTitle: 'سجل صرف الأدوية',
    pageDescription: 'دفتر صرف الروشتات والمخدرات — مع إرشاد الدفعة الأقرب انتهاءً (FEFO).',
    noCompanyMsg: 'إدارة الصيدلية تتم من داخل حساب الصيدلية.',

    // ── Server action errors ─────────────────────────────────────────────
    errNoCompany: 'هذه العملية تتم من داخل حساب الصيدلية.',
    errRecordRequired: 'السجل مطلوب.',
    errProductNotFound: 'الصنف غير موجود.',

    // ── Generic toast ────────────────────────────────────────────────────
    errGeneric: 'حدث خطأ',

    // ── Toasts ───────────────────────────────────────────────────────────
    toastOpenFailed: 'تعذّر فتح السجل',
    toastMetaSaved: 'تم حفظ البيانات',
    toastDispensed: 'تم تسجيل الصرف',
    toastCancelled: 'تم الإلغاء',

    // ── List toolbar ─────────────────────────────────────────────────────
    btnNewDispense: 'صرف جديد',
    searchPlaceholder: 'بحث: مريض / طبيب / رقم روشتة…',

    // ── Status labels ────────────────────────────────────────────────────
    statusOpen: 'مفتوح',
    statusDone: 'تم الصرف',
    statusCancelled: 'ملغي',

    // ── Empty / no results ───────────────────────────────────────────────
    emptyDispenses: 'لا عمليات صرف بعد.',
    noResults: 'لا نتائج.',

    // ── Table headers (list) ─────────────────────────────────────────────
    colDate: 'التاريخ',
    colPatient: 'المريض',
    colDoctor: 'الطبيب',
    colRx: 'روشتة',
    colInvoice: 'الفاتورة',
    colItems: 'أصناف',
    colStatus: 'الحالة',

    // ── Editor – back link ───────────────────────────────────────────────
    backToList: 'سجل الصرف',

    // ── Editor – page heading ────────────────────────────────────────────
    editorTitle: 'صرف أدوية',
    badgeCancelled: 'ملغي',
    badgeDone: 'تم',

    // ── Editor – prescription form ────────────────────────────────────────
    labelPatient: 'المريض',
    labelPhone: 'الهاتف',
    labelDoctor: 'الطبيب',
    labelRxNumber: 'رقم الروشتة',
    labelInvoiceNo: 'رقم الفاتورة (POS)',
    labelControlled: 'صنف مخدر/مقيّد',
    labelNotes: 'ملاحظات',
    btnSaveMeta: 'حفظ بيانات الروشتة',

    // ── Editor – drug search ──────────────────────────────────────────────
    searchDrugPlaceholder: 'ابحث عن دواء لإضافته…',

    // ── Editor – items list ───────────────────────────────────────────────
    emptyItems: 'لا أصناف بعد — ابحث وأضِف الأدوية.',
    batchLabel: 'دفعة: {number}',
    noBatch: 'لا توجد دفعة مسجّلة',

    // ── Editor – expiry info ──────────────────────────────────────────────
    expiryExpired: 'منتهية {date}',
    expiryWarn: 'تنتهي {date} ({days} يوم)',
    expiryOk: 'صلاحية {date}',

    // ── Editor – action buttons ───────────────────────────────────────────
    btnFinalize: 'تسجيل الصرف',
    btnPrint: 'طباعة',
    btnPrintReceipt: 'طباعة السند',
    btnCancel: 'إلغاء',
  },
};

export const en = {
  pharmacy: {
    // ── Page ─────────────────────────────────────────────────────────────
    pageTitle: 'Drug Dispense Register',
    pageDescription: 'Prescription and controlled-substance dispense log — with FEFO batch guidance.',
    noCompanyMsg: 'Pharmacy management is performed from within the pharmacy account.',

    // ── Server action errors ─────────────────────────────────────────────
    errNoCompany: 'This operation must be performed from within the pharmacy account.',
    errRecordRequired: 'Record is required.',
    errProductNotFound: 'Product not found.',

    // ── Generic toast ────────────────────────────────────────────────────
    errGeneric: 'An error occurred',

    // ── Toasts ───────────────────────────────────────────────────────────
    toastOpenFailed: 'Failed to open dispense record',
    toastMetaSaved: 'Prescription data saved',
    toastDispensed: 'Dispense recorded',
    toastCancelled: 'Cancelled',

    // ── List toolbar ─────────────────────────────────────────────────────
    btnNewDispense: 'New Dispense',
    searchPlaceholder: 'Search: patient / doctor / Rx number…',

    // ── Status labels ────────────────────────────────────────────────────
    statusOpen: 'Open',
    statusDone: 'Dispensed',
    statusCancelled: 'Cancelled',

    // ── Empty / no results ───────────────────────────────────────────────
    emptyDispenses: 'No dispense records yet.',
    noResults: 'No results.',

    // ── Table headers (list) ─────────────────────────────────────────────
    colDate: 'Date',
    colPatient: 'Patient',
    colDoctor: 'Doctor',
    colRx: 'Rx #',
    colInvoice: 'Invoice',
    colItems: 'Items',
    colStatus: 'Status',

    // ── Editor – back link ───────────────────────────────────────────────
    backToList: 'Dispense Register',

    // ── Editor – page heading ────────────────────────────────────────────
    editorTitle: 'Dispense Drugs',
    badgeCancelled: 'Cancelled',
    badgeDone: 'Done',

    // ── Editor – prescription form ────────────────────────────────────────
    labelPatient: 'Patient',
    labelPhone: 'Phone',
    labelDoctor: 'Doctor',
    labelRxNumber: 'Rx Number',
    labelInvoiceNo: 'Invoice # (POS)',
    labelControlled: 'Controlled / Restricted',
    labelNotes: 'Notes',
    btnSaveMeta: 'Save Prescription Data',

    // ── Editor – drug search ──────────────────────────────────────────────
    searchDrugPlaceholder: 'Search for a drug to add…',

    // ── Editor – items list ───────────────────────────────────────────────
    emptyItems: 'No items yet — search and add drugs.',
    batchLabel: 'Batch: {number}',
    noBatch: 'No batch recorded',

    // ── Editor – expiry info ──────────────────────────────────────────────
    expiryExpired: 'Expired {date}',
    expiryWarn: 'Expires {date} ({days} days)',
    expiryOk: 'Valid until {date}',

    // ── Editor – action buttons ───────────────────────────────────────────
    btnFinalize: 'Record Dispense',
    btnPrint: 'Print',
    btnPrintReceipt: 'Print Receipt',
    btnCancel: 'Cancel',
  },
};
