/** wholesale module messages – ar values are the original Arabic; en values are professional English translations. */

export const ar = {
  wholesale: {
    // ── Generic / shared errors ──────────────────────────────────────
    errorGeneric: 'حدث خطأ',
    noCompany: 'هذه العملية تتم من داخل حساب الشركة.',
    companyOnly: 'يتم من داخل حساب الشركة.',

    // ── Actions / server errors ──────────────────────────────────────
    errBranchRequired: 'الفرع مطلوب.',
    errCustomerRequired: 'اختر العميل.',
    errAtLeastOneItem: 'أضف صنفاً واحداً على الأقل.',
    errIssueFailed: 'تعذّر إصدار الفاتورة: {detail}',
    errCollectFailed: 'صدرت الفاتورة لكن تعذّر التحصيل: {detail}',
    errTierNameRequired: 'اسم المستوى مطلوب.',
    errInvalidPrice: 'سعر غير صحيح.',

    // ── Tiers manager page ───────────────────────────────────────────
    tiersPageTitle: 'مستويات أسعار الجملة',
    tiersPageDescription: 'عرّف مستويات البيع (قطاعي / جملة / جملة الجملة) ثم حدّد أسعار الأصناف وربط العملاء.',
    tiersPageTitleNoCompany: 'مستويات الأسعار',

    // ── Getting-started steps ─────────────────────────────────────────
    gsStepDefineTiers: 'عرّف مستويات الأسعار',
    gsStepAddCustomers: 'أضف عملاء الجملة',
    gsStepFirstInvoice: 'أصدر أول فاتورة جملة',

    // ── TiersManager component ───────────────────────────────────────
    btnNewTier: 'مستوى جديد',
    labelTierName: 'اسم المستوى *',
    placeholderTierName: 'قطاعي / جملة / جملة الجملة',
    labelTierSort: 'الترتيب',
    btnSave: 'حفظ',
    btnCancel: 'إلغاء',
    emptyTiers: 'لا توجد مستويات بعد. أضف أول مستوى.',
    colTier: 'المستوى',
    colStatus: 'الحالة',
    statusActive: 'مفعّل',
    statusInactive: 'موقوف',
    btnPrices: 'الأسعار',
    toastTierAdded: 'تمت الإضافة',
    toastTierUpdated: 'تم التحديث',

    // ── Prices page ──────────────────────────────────────────────────
    pricesPageTitle: 'قائمة أسعار الجملة',
    pricesPageDescription: 'حدّد سعر كل صنف في المستوى المختار.',
    pricesPageTitleNoCompany: 'قائمة الأسعار',
    pricesNoTier: 'أضِف مستوى سعر أولاً من «مستويات الأسعار».',

    // ── PricesEditor component ───────────────────────────────────────
    labelTierSelect: 'المستوى:',
    btnPrintList: 'طباعة القائمة',
    placeholderSearchProduct: 'بحث عن صنف…',
    colProduct: 'الصنف',
    colBasePrice: 'سعر القطاعي',
    colTierPrice: 'سعر هذا المستوى',
    emptyProducts: 'لا أصناف.',
    toastPriceSaved: 'تم حفظ السعر',

    // ── Customers page ───────────────────────────────────────────────
    customersPageTitle: 'مستويات العملاء',
    customersPageDescription: 'حدّد مستوى السعر لكل عميل.',
    customersPageTitleNoCompany: 'مستويات العملاء',

    // ── CustomerTiers component ──────────────────────────────────────
    placeholderSearchCustomer: 'بحث عن عميل…',
    noTiersYet: 'أضِف مستويات أسعار أولاً.',
    colCustomer: 'العميل',
    colCode: 'الكود',
    colLevel: 'المستوى',
    optRetailDefault: '— قطاعي (افتراضي) —',
    emptyCustomers: 'لا عملاء.',
    toastTierAssigned: 'تم تحديد المستوى',

    // ── Order page ───────────────────────────────────────────────────
    orderPageTitle: 'فاتورة جملة',
    orderPageDescription: 'اختر العميل فيتعبّى سعر مستواه تلقائياً — وتقدر تعدّل سعر أي صنف.',
    orderPageTitleNoCompany: 'فاتورة جملة',

    // ── WholesaleOrder component ─────────────────────────────────────
    optChooseCustomer: '— اختر العميل —',
    priceLevelLabel: 'مستوى السعر:',
    priceLevelCustom: 'مستوى خاص',
    priceLevelRetail: 'قطاعي (افتراضي)',
    priceLevelHint: 'الأسعار اتعبّت تلقائياً وتقدر تعدّلها.',
    placeholderSearchItem: 'ابحث عن صنف لإضافته…',
    invoiceLinesTitle: 'بنود الفاتورة',
    emptyCart: 'لا بنود — أضف أصنافاً.',
    labelTotal: 'الإجمالي',
    collectNowLabel: 'تحصيل نقدي الآن (غير ذلك: آجل على حساب العميل)',
    optCash: 'كاش',
    optCard: 'فيزا',
    btnIssueAndPrint: 'إصدار الفاتورة وطباعة',
    toastChooseCustomer: 'اختر العميل',
    toastChooseBranch: 'اختر الفرع',
    toastInvoiceIssued: 'تم إصدار الفاتورة {number}',
    toastIssueFailed: 'تعذّر إصدار الفاتورة',
  },
};

export const en = {
  wholesale: {
    // ── Generic / shared errors ──────────────────────────────────────
    errorGeneric: 'An error occurred',
    noCompany: 'This action requires a company account.',
    companyOnly: 'Available inside a company account.',

    // ── Actions / server errors ──────────────────────────────────────
    errBranchRequired: 'Branch is required.',
    errCustomerRequired: 'Please select a customer.',
    errAtLeastOneItem: 'Add at least one item.',
    errIssueFailed: 'Could not issue invoice: {detail}',
    errCollectFailed: 'Invoice issued but payment collection failed: {detail}',
    errTierNameRequired: 'Tier name is required.',
    errInvalidPrice: 'Invalid price.',

    // ── Tiers manager page ───────────────────────────────────────────
    tiersPageTitle: 'Wholesale Price Tiers',
    tiersPageDescription: 'Define price tiers (retail / wholesale / bulk) then set item prices and link customers.',
    tiersPageTitleNoCompany: 'Price Tiers',

    // ── Getting-started steps ─────────────────────────────────────────
    gsStepDefineTiers: 'Define price tiers',
    gsStepAddCustomers: 'Add wholesale customers',
    gsStepFirstInvoice: 'Issue your first wholesale invoice',

    // ── TiersManager component ───────────────────────────────────────
    btnNewTier: 'New Tier',
    labelTierName: 'Tier Name *',
    placeholderTierName: 'Retail / Wholesale / Bulk',
    labelTierSort: 'Order',
    btnSave: 'Save',
    btnCancel: 'Cancel',
    emptyTiers: 'No tiers yet. Add your first tier.',
    colTier: 'Tier',
    colStatus: 'Status',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    btnPrices: 'Prices',
    toastTierAdded: 'Tier added',
    toastTierUpdated: 'Tier updated',

    // ── Prices page ──────────────────────────────────────────────────
    pricesPageTitle: 'Wholesale Price List',
    pricesPageDescription: 'Set the price for each item in the selected tier.',
    pricesPageTitleNoCompany: 'Price List',
    pricesNoTier: 'Add a price tier first from "Price Tiers".',

    // ── PricesEditor component ───────────────────────────────────────
    labelTierSelect: 'Tier:',
    btnPrintList: 'Print List',
    placeholderSearchProduct: 'Search for an item…',
    colProduct: 'Item',
    colBasePrice: 'Retail Price',
    colTierPrice: 'This Tier\'s Price',
    emptyProducts: 'No items.',
    toastPriceSaved: 'Price saved',

    // ── Customers page ───────────────────────────────────────────────
    customersPageTitle: 'Customer Price Levels',
    customersPageDescription: 'Assign a price tier to each customer.',
    customersPageTitleNoCompany: 'Customer Levels',

    // ── CustomerTiers component ──────────────────────────────────────
    placeholderSearchCustomer: 'Search for a customer…',
    noTiersYet: 'Add price tiers first.',
    colCustomer: 'Customer',
    colCode: 'Code',
    colLevel: 'Level',
    optRetailDefault: '— Retail (default) —',
    emptyCustomers: 'No customers.',
    toastTierAssigned: 'Price level assigned',

    // ── Order page ───────────────────────────────────────────────────
    orderPageTitle: 'Wholesale Invoice',
    orderPageDescription: 'Select a customer and their tier prices will be pre-filled — you can adjust any item price.',
    orderPageTitleNoCompany: 'Wholesale Invoice',

    // ── WholesaleOrder component ─────────────────────────────────────
    optChooseCustomer: '— Select Customer —',
    priceLevelLabel: 'Price level:',
    priceLevelCustom: 'Custom tier',
    priceLevelRetail: 'Retail (default)',
    priceLevelHint: 'Prices are pre-filled from the tier — you can adjust them.',
    placeholderSearchItem: 'Search for an item to add…',
    invoiceLinesTitle: 'Invoice Lines',
    emptyCart: 'No lines — add items.',
    labelTotal: 'Total',
    collectNowLabel: 'Collect cash now (otherwise: deferred to customer account)',
    optCash: 'Cash',
    optCard: 'Card',
    btnIssueAndPrint: 'Issue Invoice & Print',
    toastChooseCustomer: 'Please select a customer',
    toastChooseBranch: 'Please select a branch',
    toastInvoiceIssued: 'Invoice {number} issued',
    toastIssueFailed: 'Could not issue invoice',
  },
};
