/** rep module messages – ar values are the original Arabic; en values are professional English translations. */

export const ar = {
  rep: {
    // ── App title ─────────────────────────────────────────────────────────────
    appTitle: 'تطبيق المندوب',

    // ── Connectivity ──────────────────────────────────────────────────────────
    statusOnline: 'متصل',
    statusOffline: 'غير متصل',
    offlineBanner: 'أنت غير متصل — الفواتير ستُحفظ محلياً وتُزامَن تلقائياً عند عودة الإنترنت.',

    // ── Offline queue / sync ──────────────────────────────────────────────────
    pendingSync: 'بانتظار المزامنة ({count})',
    toastSynced: 'تمت مزامنة {count} فاتورة',
    toastQueued: 'تم حفظ الفاتورة للمزامنة عند عودة الاتصال',

    // ── No-data empty state ───────────────────────────────────────────────────
    noDataState: 'لا توجد بيانات محفوظة. افتح التطبيق وأنت متصل بالإنترنت مرة واحدة على الأقل لتحميل العملاء والأصناف.',

    // ── Day session ───────────────────────────────────────────────────────────
    dayOpen: '🟢 يوم العمل مفتوح',
    dayClosed: '🔴 تم إنهاء اليوم',
    dayNone: '⚪ اليوم لم يبدأ',
    btnStartDay: 'بدء اليوم',
    btnEndDay: 'إنهاء اليوم',
    btnDaySummary: 'ملخص اليوم',
    dayClosedHint: 'لا يمكن البيع أو التحصيل بعد إنهاء اليوم — يمكنك فقط طلب التحميل. للفتح من جديد راجع المدير.',
    toastDayStarted: 'تم بدء اليوم',
    toastDayEnded: 'تم إنهاء اليوم',

    // ── Source / van ──────────────────────────────────────────────────────────
    sellingFrom: 'البيع من:',
    btnVanStock: 'مخزون السيارة',
    sourceLabelVan: 'سيارتك ({name})',
    sourceLabelBranch: 'مخزن الفرع',

    // ── Last sale banner ──────────────────────────────────────────────────────
    invoiceDone: 'تمت الفاتورة',
    btnPrintInvoice: 'الفاتورة',
    btnPrintReceipt: 'سند التحصيل',
    toastInvoiceDone: 'تمت الفاتورة {number}',

    // ── Today's visit plan ────────────────────────────────────────────────────
    visitPlanTitle: 'خطة زيارات اليوم ({count})',
    btnSell: 'بيع',
    btnNoSale: 'بدون بيع',
    toastNoSale: 'تم تسجيل زيارة بدون بيع',

    // ── Selectors ─────────────────────────────────────────────────────────────
    selectCustomerPlaceholder: 'اختر عميلاً…',
    searchProductPlaceholder: 'بحث عن صنف…',

    // ── Action buttons ────────────────────────────────────────────────────────
    btnNewCustomer: 'عميل جديد',
    btnLoadRequest: 'طلب تحميل',
    btnStatement: 'كشف الحساب',

    // ── Customer account / debt ───────────────────────────────────────────────
    customerAccountTitle: 'حساب العميل',
    debtLabel: 'المديونية:',
    agingBucket0_30: '٠-٣٠:',
    agingBucket31_60: '٣١-٦٠:',
    agingBucket61_90: '٦١-٩٠:',
    agingBucket90plus: '+٩٠:',
    ageDays: '{days} يوم',
    remaining: 'المتبقي:',
    btnCollect: 'تحصيل',
    noOpenInvoices: 'لا توجد فواتير مستحقة على هذا العميل.',
    debtOffline: 'المديونية غير متاحة بدون اتصال.',

    // ── Cart / checkout ───────────────────────────────────────────────────────
    checkboxCashPayment: 'تحصيل نقدي فوري',
    btnCheckout: 'إتمام البيع · {amount}',
    cartEmptyTitle: 'اختر الأصناف لإضافتها للفاتورة',

    // ── Collect dialog ────────────────────────────────────────────────────────
    collectDialogTitle: 'تحصيل فاتورة {number}',
    collectRemainingLabel: 'المتبقي:',
    collectMethodCash: 'نقدي',
    collectMethodTransfer: 'تحويل بنكي',
    collectMethodCheck: 'شيك',
    btnConfirmCollect: 'تأكيد التحصيل',
    toastCollected: 'تم التحصيل',
    toastCollectQueued: 'تم حفظ التحصيل دون اتصال — بانتظار المزامنة والاعتماد من الخادم.',

    // ── New customer dialog ───────────────────────────────────────────────────
    newCustomerTitle: 'عميل جديد',
    newCustomerHint: 'سيُرسل العميل لاعتماد مدير النظام (وله تعديله) قبل أن تتمكن من البيع له.',
    fieldCustomerCode: 'كود العميل *',
    fieldPhone: 'الهاتف',
    fieldCustomerName: 'اسم العميل *',
    fieldCustomerNameAr: 'الاسم بالعربي',
    fieldCity: 'المنطقة',
    fieldEmail: 'البريد الإلكتروني',
    fieldAddress: 'العنوان',
    fieldTaxNumber: 'الرقم الضريبي',
    fieldCreditLimit: 'حد الائتمان',
    fieldVisitDay: 'يوم الزيارة (اختياري)',
    btnSubmitForApproval: 'إرسال للاعتماد',
    toastCustomerSubmitted: 'تم إرسال العميل لاعتماد مدير النظام',

    // ── Error / generic ───────────────────────────────────────────────────────
    errorGeneric: 'حدث خطأ',

    // ── Actions (server) ──────────────────────────────────────────────────────
    errorUnauthorized: 'غير مصرح',
    errorBranchRequired: 'الفرع مطلوب.',
    errorDayClosed: 'تم إنهاء يوم اليوم — لا يمكن إعادة فتحه إلا بموافقة المدير.',
    errorNotSuperAdmin: 'إعادة الفتح متاحة لمدير النظام فقط.',
    errorCodeRequired: 'كود العميل مطلوب.',
    errorNameRequired: 'اسم العميل مطلوب.',
    notesDebtCollection: 'تحصيل مديونية',
  },
};

export const en = {
  rep: {
    // ── App title ─────────────────────────────────────────────────────────────
    appTitle: 'Rep Terminal',

    // ── Connectivity ──────────────────────────────────────────────────────────
    statusOnline: 'Online',
    statusOffline: 'Offline',
    offlineBanner: 'You are offline — invoices will be saved locally and synced automatically when the connection is restored.',

    // ── Offline queue / sync ──────────────────────────────────────────────────
    pendingSync: 'Pending Sync ({count})',
    toastSynced: '{count} invoice(s) synced',
    toastQueued: 'Invoice saved for sync when connection is restored',

    // ── No-data empty state ───────────────────────────────────────────────────
    noDataState: 'No cached data. Open the app while connected at least once to load customers and products.',

    // ── Day session ───────────────────────────────────────────────────────────
    dayOpen: '🟢 Work day is open',
    dayClosed: '🔴 Work day ended',
    dayNone: '⚪ Day not started',
    btnStartDay: 'Start Day',
    btnEndDay: 'End Day',
    btnDaySummary: 'Day Summary',
    dayClosedHint: 'Sales and collections are disabled after ending the day — you can only submit load requests. Contact the manager to reopen.',
    toastDayStarted: 'Work day started',
    toastDayEnded: 'Work day ended',

    // ── Source / van ──────────────────────────────────────────────────────────
    sellingFrom: 'Selling from:',
    btnVanStock: 'Van Stock',
    sourceLabelVan: 'Your Van ({name})',
    sourceLabelBranch: 'Branch Warehouse',

    // ── Last sale banner ──────────────────────────────────────────────────────
    invoiceDone: 'Invoice posted',
    btnPrintInvoice: 'Invoice',
    btnPrintReceipt: 'Receipt',
    toastInvoiceDone: 'Invoice {number} posted',

    // ── Today's visit plan ────────────────────────────────────────────────────
    visitPlanTitle: "Today's Visit Plan ({count})",
    btnSell: 'Sell',
    btnNoSale: 'No Sale',
    toastNoSale: 'No-sale visit recorded',

    // ── Selectors ─────────────────────────────────────────────────────────────
    selectCustomerPlaceholder: 'Select a customer…',
    searchProductPlaceholder: 'Search for a product…',

    // ── Action buttons ────────────────────────────────────────────────────────
    btnNewCustomer: 'New Customer',
    btnLoadRequest: 'Load Request',
    btnStatement: 'Account Statement',

    // ── Customer account / debt ───────────────────────────────────────────────
    customerAccountTitle: 'Customer Account',
    debtLabel: 'Balance Due:',
    agingBucket0_30: '0-30:',
    agingBucket31_60: '31-60:',
    agingBucket61_90: '61-90:',
    agingBucket90plus: '+90:',
    ageDays: '{days} days',
    remaining: 'Remaining:',
    btnCollect: 'Collect',
    noOpenInvoices: 'No outstanding invoices for this customer.',
    debtOffline: 'Balance unavailable offline.',

    // ── Cart / checkout ───────────────────────────────────────────────────────
    checkboxCashPayment: 'Collect cash immediately',
    btnCheckout: 'Complete Sale · {amount}',
    cartEmptyTitle: 'Select products to add to the invoice',

    // ── Collect dialog ────────────────────────────────────────────────────────
    collectDialogTitle: 'Collect Invoice {number}',
    collectRemainingLabel: 'Remaining:',
    collectMethodCash: 'Cash',
    collectMethodTransfer: 'Bank Transfer',
    collectMethodCheck: 'Check',
    btnConfirmCollect: 'Confirm Collection',
    toastCollected: 'Payment collected',
    toastCollectQueued: 'Collection saved offline — pending sync & server validation.',

    // ── New customer dialog ───────────────────────────────────────────────────
    newCustomerTitle: 'New Customer',
    newCustomerHint: 'The customer will be sent for approval by the system administrator (who may edit it) before you can sell to them.',
    fieldCustomerCode: 'Customer Code *',
    fieldPhone: 'Phone',
    fieldCustomerName: 'Customer Name *',
    fieldCustomerNameAr: 'Name in Arabic',
    fieldCity: 'Area / City',
    fieldEmail: 'Email',
    fieldAddress: 'Address',
    fieldTaxNumber: 'Tax Number',
    fieldCreditLimit: 'Credit Limit',
    fieldVisitDay: 'Visit Day (optional)',
    btnSubmitForApproval: 'Submit for Approval',
    toastCustomerSubmitted: 'Customer submitted for administrator approval',

    // ── Error / generic ───────────────────────────────────────────────────────
    errorGeneric: 'An error occurred',

    // ── Actions (server) ──────────────────────────────────────────────────────
    errorUnauthorized: 'Unauthorized',
    errorBranchRequired: 'Branch is required.',
    errorDayClosed: 'Today\'s day has been closed — it can only be reopened with manager approval.',
    errorNotSuperAdmin: 'Reopening is only available to the system administrator.',
    errorCodeRequired: 'Customer code is required.',
    errorNameRequired: 'Customer name is required.',
    notesDebtCollection: 'Debt collection',
  },
};
