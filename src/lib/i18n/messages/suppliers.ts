/** suppliers module messages – ar values are the original Arabic; en values are professional English translations. */

export const ar = {
  suppliers: {
    // ── Page / PageHeader ────────────────────────────────────────────
    pageTitle: 'الموردين',
    statementsTitle: 'كشوف حسابات الموردين',
    statementsDescription: 'ابحث عن مورد لفتح كشف حسابه أو طباعته PDF.',
    pageDescription: 'بيانات الموردين وأرصدتهم المستحقة والسداد',

    // ── Toolbar ──────────────────────────────────────────────────────
    btnNew: 'مورد جديد',
    totalPayable: 'إجمالي المستحق للموردين',
    searchPlaceholder: 'بحث…',

    // ── Form (add / edit) ────────────────────────────────────────────
    formTitleNew: 'مورد جديد',
    formTitleEdit: 'تعديل: {name}',
    fieldCode: 'كود المورد *',
    fieldNameAr: 'الاسم (عربي)',
    fieldNameEn: 'الاسم (إنجليزي) *',
    fieldPhone: 'الهاتف',
    fieldEmail: 'البريد الإلكتروني',
    fieldTaxNumber: 'الرقم الضريبي',
    fieldCity: 'المدينة',
    fieldAddress: 'العنوان',
    btnSave: 'حفظ',
    btnCancel: 'إلغاء',

    // ── Validation ───────────────────────────────────────────────────
    errCodeRequired: 'كود المورد مطلوب.',
    errNameRequired: 'اسم المورد مطلوب.',
    errImportNoRows: 'لا توجد صفوف صالحة (الكود والاسم مطلوبان).',

    // ── Table headers ────────────────────────────────────────────────
    colCode: 'الكود',
    colSupplier: 'المورد',
    colPhone: 'الهاتف',
    colCity: 'المدينة',
    colBalance: 'الرصيد المستحق',
    colStatus: 'الحالة',

    // ── Status badges ─────────────────────────────────────────────────
    statusActive: 'نشط',
    statusInactive: 'موقوف',

    // ── Row actions ───────────────────────────────────────────────────
    btnPay: 'سداد',
    ariaStatement: 'كشف حساب',
    ariaStatementTitle: 'كشف حساب',
    ariaEdit: 'تعديل',
    btnDeactivate: 'إيقاف',
    btnActivate: 'تفعيل',

    // ── Empty states ──────────────────────────────────────────────────
    emptyNoSuppliers: 'لا يوجد موردون بعد.',
    sectionIdentity: 'الهوية',
    sectionContact: 'بيانات التواصل',
    emptyNoResults: 'لا توجد نتائج.',

    // ── Toast messages ────────────────────────────────────────────────
    toastCreated: 'تمت إضافة المورد',
    toastUpdated: 'تم تحديث المورد',
    toastError: 'حدث خطأ',
    toastPaymentSuccess: 'تم تسجيل السداد وترحيل القيد',

    // ── Payment dialog ────────────────────────────────────────────────
    payDialogTitle: 'سداد لمورد: {name}',
    payDialogAmountDue: 'المستحق:',
    payDialogNoBranch: 'أنشئ فرعاً أولاً لتسجيل السداد.',
    payFieldBranch: 'الفرع الصارف *',
    payFieldAmount: 'المبلغ *',
    payFieldMethod: 'طريقة الدفع',
    payFieldRef: 'رقم المرجع',
    payFieldDate: 'التاريخ',
    btnConfirmPayment: 'تأكيد السداد',

    // ── Statement page ────────────────────────────────────────────────
    stmtBackLink: 'الموردين',
    stmtTitle: 'كشف حساب: {name}',
    stmtDescription: 'الكود {code}',
    stmtDescriptionWithPhone: 'الكود {code} · {phone}',
    stmtSummaryBalance: 'الرصيد المستحق',
    stmtSummaryReceiptCount: 'مرات الاستلام',
    stmtSummaryPaymentCount: 'مرات السداد',
    stmtDebitLabel: 'مستحق (بضاعة)',
    stmtCreditLabel: 'سداد',
    stmtEmpty: 'لا توجد حركات على هذا المورد بعد.',
    stmtDescReceipt: 'استلام بضاعة (مشتريات)',
    stmtDescPayment: 'سداد ({method})',
  },
};

export const en = {
  suppliers: {
    // ── Page / PageHeader ────────────────────────────────────────────
    pageTitle: 'Suppliers',
    statementsTitle: 'Supplier Statements',
    statementsDescription: 'Search a supplier to open or print (PDF) their statement.',
    pageDescription: 'Supplier records, outstanding payables, and payment history',

    // ── Toolbar ──────────────────────────────────────────────────────
    btnNew: 'New Supplier',
    totalPayable: 'Total Payables',
    searchPlaceholder: 'Search…',

    // ── Form (add / edit) ────────────────────────────────────────────
    formTitleNew: 'New Supplier',
    formTitleEdit: 'Edit: {name}',
    fieldCode: 'Supplier Code *',
    fieldNameAr: 'Name (Arabic)',
    fieldNameEn: 'Name (English) *',
    fieldPhone: 'Phone',
    fieldEmail: 'Email',
    fieldTaxNumber: 'Tax Number',
    fieldCity: 'City',
    fieldAddress: 'Address',
    btnSave: 'Save',
    btnCancel: 'Cancel',

    // ── Validation ───────────────────────────────────────────────────
    errCodeRequired: 'Supplier code is required.',
    errNameRequired: 'Supplier name is required.',
    errImportNoRows: 'No valid rows found (code and name are required).',

    // ── Table headers ────────────────────────────────────────────────
    colCode: 'Code',
    colSupplier: 'Supplier',
    colPhone: 'Phone',
    colCity: 'City',
    colBalance: 'Outstanding Balance',
    colStatus: 'Status',

    // ── Status badges ─────────────────────────────────────────────────
    statusActive: 'Active',
    statusInactive: 'Suspended',

    // ── Row actions ───────────────────────────────────────────────────
    btnPay: 'Pay',
    ariaStatement: 'Account statement',
    ariaStatementTitle: 'Account statement',
    ariaEdit: 'Edit',
    btnDeactivate: 'Deactivate',
    btnActivate: 'Activate',

    // ── Empty states ──────────────────────────────────────────────────
    emptyNoSuppliers: 'No suppliers yet.',
    sectionIdentity: 'Identity',
    sectionContact: 'Contact',
    emptyNoResults: 'No results found.',

    // ── Toast messages ────────────────────────────────────────────────
    toastCreated: 'Supplier added',
    toastUpdated: 'Supplier updated',
    toastError: 'An error occurred',
    toastPaymentSuccess: 'Payment recorded and journal entry posted',

    // ── Payment dialog ────────────────────────────────────────────────
    payDialogTitle: 'Pay Supplier: {name}',
    payDialogAmountDue: 'Amount due:',
    payDialogNoBranch: 'Please create a branch first to record a payment.',
    payFieldBranch: 'Paying Branch *',
    payFieldAmount: 'Amount *',
    payFieldMethod: 'Payment Method',
    payFieldRef: 'Reference Number',
    payFieldDate: 'Date',
    btnConfirmPayment: 'Confirm Payment',

    // ── Statement page ────────────────────────────────────────────────
    stmtBackLink: 'Suppliers',
    stmtTitle: 'Account Statement: {name}',
    stmtDescription: 'Code {code}',
    stmtDescriptionWithPhone: 'Code {code} · {phone}',
    stmtSummaryBalance: 'Outstanding Balance',
    stmtSummaryReceiptCount: 'Receipts',
    stmtSummaryPaymentCount: 'Payments',
    stmtDebitLabel: 'Payable (Goods)',
    stmtCreditLabel: 'Payment',
    stmtEmpty: 'No transactions for this supplier yet.',
    stmtDescReceipt: 'Goods Receipt (Purchase)',
    stmtDescPayment: 'Payment ({method})',
  },
};
