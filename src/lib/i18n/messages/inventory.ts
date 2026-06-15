/** inventory module messages. Fill the namespace below; keep ar/en keys identical. */
export const ar = {
  inventory: {
    // Page headers
    pageTitle: 'أرصدة المخزون',
    pageDescription: 'الأرصدة الحالية لكل صنف في كل مخزن وسجل الحركات',

    // Tabs
    tabLevels: 'الأرصدة',
    tabMovements: 'الحركات',

    // Filters / search
    allWarehouses: 'كل المخازن',
    searchProduct: 'بحث عن صنف…',

    // Buttons
    adjustStock: 'تسوية مخزون',
    adjust: 'تسوية',

    // Table headers — levels
    colProduct: 'الصنف',
    colWarehouse: 'المخزن',
    colAvailable: 'المتاح',
    colReserved: 'المحجوز',
    colStatus: 'الحالة',

    // Status badges — levels
    statusBelowMin: 'تحت الحد ({min})',
    statusAvailable: 'متاح',

    // Empty states
    emptyLevels: 'لا توجد أرصدة مخزون بعد. استلم أمر شراء أو اعمل تسوية افتتاحية.',
    emptyMovements: 'لا توجد حركات مخزون بعد.',

    // Table headers — movements
    colDate: 'التاريخ',
    colType: 'النوع',
    colQuantity: 'الكمية',
    colNotes: 'ملاحظات',

    // Adjust dialog
    adjustDialogTitle: 'تسوية مخزون',
    adjustWarehouseLabel: 'المخزن *',
    adjustProductLabel: 'الصنف *',
    adjustProductPlaceholder: 'اختر صنفاً…',
    adjustDeltaLabel: 'كمية التسوية * (موجبة للإضافة، سالبة للخصم)',
    adjustDeltaPlaceholder: 'مثال: 10 أو -5',
    adjustNotesLabel: 'ملاحظات',
    adjustNotesPlaceholder: 'سبب التسوية',
    adjustSubmit: 'تسجيل التسوية',
    adjustCancel: 'إلغاء',

    // Toasts — adjust
    toastAdjustSuccess: 'تم تسجيل التسوية وتحديث الرصيد',
    toastError: 'حدث خطأ',

    // Server action errors — adjust
    errorWarehouseRequired: 'المخزن مطلوب.',
    errorProductRequired: 'المنتج مطلوب.',
    errorDeltaRequired: 'أدخل كمية تسوية غير صفرية (موجبة للإضافة، سالبة للخصم).',
    defaultAdjustmentNote: 'تسوية يدوية',

    // ── Transfers ──────────────────────────────────────────────────────────────
    transfersPageTitle: 'التحويلات بين المخازن',
    transfersPageDescription: 'نقل المخزون من مخزن لآخر',

    newTransfer: 'تحويل جديد',
    transferNeedMinWarnings: 'تحتاج مخزنين على الأقل ومنتجاً واحداً لإنشاء تحويل.',
    transferFormTitle: 'تحويل جديد',
    fromWarehouse: 'من مخزن *',
    toWarehouse: 'إلى مخزن *',
    notesLabel: 'ملاحظات',
    selectPlaceholder: 'اختر…',
    selectProductPlaceholder: 'اختر منتجاً…',
    colProductItem: 'المنتج',
    colQty: 'الكمية',
    addLine: 'إضافة بند',
    saveDraft: 'حفظ',
    cancelBtn: 'إلغاء',

    emptyTransfers: 'لا توجد تحويلات بعد.',
    searchTransfer: 'بحث برقم التحويل…',
    noResults: 'لا توجد نتائج مطابقة.',

    colTransferNo: 'رقم التحويل',
    colFrom: 'من',
    colTo: 'إلى',
    colStatusTh: 'الحالة',

    completeTransfer: 'تنفيذ',
    cancelTransfer: 'إلغاء',

    confirmCompleteTitle: 'تنفيذ التحويل؟',
    confirmCompleteMessage: 'سيتم نقل الكميات من المخزن المصدر إلى الوجهة. لا يمكن التراجع.',
    confirmCompleteBtn: 'تنفيذ',

    confirmCancelTransferTitle: 'إلغاء التحويل؟',
    confirmCancelTransferBtn: 'إلغاء',
    confirmCancelTransferBack: 'تراجع',

    toastTransferCreated: 'تم إنشاء أمر التحويل',
    toastTransferCompleted: 'تم تنفيذ التحويل ونقل المخزون',
    toastTransferCancelled: 'تم إلغاء التحويل',

    // Server action errors — transfers
    errorSelectWarehouses: 'اختر المخزن المصدر والمخزن الوجهة.',
    errorSameWarehouse: 'لا يمكن التحويل لنفس المخزن.',
    errorAtLeastOneLine: 'أضف بنداً واحداً على الأقل.',

    // ── Requests (stock load) ──────────────────────────────────────────────────
    requestsPageTitle: 'طلبات التحميل',
    requestsPageDescription: 'المندوب يطلب تحميل بضاعة من المخزن إلى سيارته باعتماد أمين المخزن',

    newRequest: 'طلب تحميل جديد',
    requestNeedWarning: 'تحتاج مخزناً مصدراً وسيارة (مخزن سيارة) ومنتجاً واحداً على الأقل.',
    requestFormTitle: 'طلب تحميل جديد',
    fromWarehouseLabel: 'من مخزن *',
    toVanLabel: 'إلى سيارة *',

    addItem: 'إضافة صنف',
    submitRequest: 'إرسال الطلب',

    emptyRequests: 'لا توجد طلبات تحميل بعد.',

    requestStatusPending: 'معلّق',
    requestStatusApproved: 'معتمد ومحمّل',
    requestStatusRejected: 'مرفوض',
    requestStatusCancelled: 'ملغي',

    approveLoad: 'اعتماد وتحميل',
    requestedLoadingDate: 'تاريخ التحميل المطلوب',
    approvedLoadingDate: 'التاريخ المعتمد',
    changeLoadingDate: 'تعديل التاريخ',
    dateChangeNote: 'سبب تعديل التاريخ',
    loadingDateSaved: 'تم تحديث تاريخ التحميل.',
    rejectRequest: 'رفض',
    cancelRequest: 'إلغاء',

    confirmApproveTitle: 'اعتماد وتحميل الطلب؟',
    confirmApproveMessage: 'سيتم نقل الكميات من المخزن إلى سيارة المندوب.',
    confirmApproveBtn: 'اعتماد وتحميل',

    toastRequestSent: 'تم إرسال الطلب للاعتماد',
    toastRequestApproved: 'تم الاعتماد ونقل البضاعة للسيارة',

    requestDirectionLabel: 'من {from} ← إلى {to}',

    // Server action errors — requests
    errorSelectSourceAndVan: 'اختر المخزن المصدر والسيارة.',
    errorSameSourceDest: 'المصدر والوجهة لا يمكن أن يكونا نفس المخزن.',
    errorAtLeastOneItem: 'أضف صنفاً واحداً على الأقل.',

    // ── Stock Count ────────────────────────────────────────────────────────────
    countPageTitle: 'الجرد',
    countPageDescription: 'جرد المخازن والسيارات وكشف العجز/الزيادة وتسويته',

    warehouseOrVanLabel: 'المخزن / السيارة',
    startNewCount: 'بدء جرد جديد',

    emptyCount: 'لا توجد عمليات جرد بعد.',

    colCountNo: 'رقم الجرد',
    colCountDate: 'التاريخ',
    colCountStatus: 'الحالة',

    countStatusDraft: 'مسودة',
    countStatusCompleted: 'معتمد',
    countStatusCancelled: 'ملغي',

    continueCount: 'متابعة الجرد',
    viewCount: 'عرض',

    backToAllCounts: 'كل عمليات الجرد',
    shortageLabel: 'عجز: {n}',
    surplusLabel: 'زيادة: +{n}',
    searchCountProduct: 'بحث عن صنف…',

    colBookQty: 'الرصيد الدفتري',
    colActualQty: 'الفعلي (المعدود)',
    colDiff: 'الفرق',

    saveTempBtn: 'حفظ مؤقت',
    finalizeCountBtn: 'اعتماد الجرد وتسوية الأرصدة',
    cancelCountBtn: 'إلغاء الجرد',

    confirmFinalizeTitle: 'اعتماد الجرد؟',
    confirmFinalizeMessage: 'سيتم ترحيل تسويات للعجز/الزيادة وتعديل أرصدة المخزون. لا يمكن التراجع.',
    confirmFinalizeBtn: 'اعتماد',

    confirmCancelCountTitle: 'إلغاء الجرد؟',
    confirmCancelCountBtn: 'إلغاء',
    confirmCancelCountBack: 'تراجع',

    toastCountCreated: 'تم إنشاء الجرد',
    toastCountSaved: 'تم حفظ الجرد',
    toastCountFinalized: 'تم اعتماد الجرد وتسوية الأرصدة',

    // Server action errors — count
    errorSelectWarehouse: 'اختر المخزن.',
    errorWarehouseNotFound: 'المخزن غير موجود.',

    // ── Low Stock ──────────────────────────────────────────────────────────────
    lowStockPageTitle: 'تنبيهات نقص المخزون',
    lowStockPageDescription: 'الأصناف التي وصلت أو نزلت تحت حد إعادة الطلب — راجعها للطلب.',

    emptyLowStock: 'لا توجد أصناف تحت حد إعادة الطلب.',

    colCode: 'الكود',
    colReorderLevel: 'حد الطلب',
    colDeficit: 'العجز',

    statusOutOfStock: 'نفد',

    // ── Expiry ─────────────────────────────────────────────────────────────────
    expiryPageTitle: 'قرب انتهاء الصلاحية',
    expiryPageDescription: 'الدفعات المستلمة التي تنتهي صلاحيتها خلال {days} يوماً أو انتهت بالفعل',

    emptyExpiry: 'لا توجد دفعات قريبة من انتهاء الصلاحية. (تُسجَّل الصلاحية عند استلام أوامر الشراء.)',

    colBatch: 'التشغيلة',
    colExpiryDate: 'تاريخ الصلاحية',

    statusExpired: 'منتهية ({days} يوم)',
    statusExpiringSoon: 'خلال {days} يوم',
    statusExpiringDays: '{days} يوم',
  },
};

export const en = {
  inventory: {
    // Page headers
    pageTitle: 'Stock Levels',
    pageDescription: 'Current balances per item per warehouse, and movement history',

    // Tabs
    tabLevels: 'Levels',
    tabMovements: 'Movements',

    // Filters / search
    allWarehouses: 'All Warehouses',
    searchProduct: 'Search product…',

    // Buttons
    adjustStock: 'Stock Adjustment',
    adjust: 'Adjust',

    // Table headers — levels
    colProduct: 'Product',
    colWarehouse: 'Warehouse',
    colAvailable: 'Available',
    colReserved: 'Reserved',
    colStatus: 'Status',

    // Status badges — levels
    statusBelowMin: 'Below Min ({min})',
    statusAvailable: 'Available',

    // Empty states
    emptyLevels: 'No stock levels yet. Receive a purchase order or create an opening adjustment.',
    emptyMovements: 'No stock movements yet.',

    // Table headers — movements
    colDate: 'Date',
    colType: 'Type',
    colQuantity: 'Quantity',
    colNotes: 'Notes',

    // Adjust dialog
    adjustDialogTitle: 'Stock Adjustment',
    adjustWarehouseLabel: 'Warehouse *',
    adjustProductLabel: 'Product *',
    adjustProductPlaceholder: 'Select a product…',
    adjustDeltaLabel: 'Adjustment Qty * (positive to add, negative to deduct)',
    adjustDeltaPlaceholder: 'e.g. 10 or -5',
    adjustNotesLabel: 'Notes',
    adjustNotesPlaceholder: 'Reason for adjustment',
    adjustSubmit: 'Record Adjustment',
    adjustCancel: 'Cancel',

    // Toasts — adjust
    toastAdjustSuccess: 'Adjustment recorded and balance updated',
    toastError: 'An error occurred',

    // Server action errors — adjust
    errorWarehouseRequired: 'Warehouse is required.',
    errorProductRequired: 'Product is required.',
    errorDeltaRequired: 'Enter a non-zero adjustment quantity (positive to add, negative to deduct).',
    defaultAdjustmentNote: 'Manual adjustment',

    // ── Transfers ──────────────────────────────────────────────────────────────
    transfersPageTitle: 'Warehouse Transfers',
    transfersPageDescription: 'Move stock from one warehouse to another',

    newTransfer: 'New Transfer',
    transferNeedMinWarnings: 'You need at least 2 warehouses and 1 product to create a transfer.',
    transferFormTitle: 'New Transfer',
    fromWarehouse: 'From Warehouse *',
    toWarehouse: 'To Warehouse *',
    notesLabel: 'Notes',
    selectPlaceholder: 'Select…',
    selectProductPlaceholder: 'Select a product…',
    colProductItem: 'Product',
    colQty: 'Quantity',
    addLine: 'Add Line',
    saveDraft: 'Save',
    cancelBtn: 'Cancel',

    emptyTransfers: 'No transfers yet.',
    searchTransfer: 'Search by transfer number…',
    noResults: 'No matching results.',

    colTransferNo: 'Transfer #',
    colFrom: 'From',
    colTo: 'To',
    colStatusTh: 'Status',

    completeTransfer: 'Complete',
    cancelTransfer: 'Cancel',

    confirmCompleteTitle: 'Complete Transfer?',
    confirmCompleteMessage: 'Quantities will be moved from the source warehouse to the destination. This cannot be undone.',
    confirmCompleteBtn: 'Complete',

    confirmCancelTransferTitle: 'Cancel Transfer?',
    confirmCancelTransferBtn: 'Cancel',
    confirmCancelTransferBack: 'Go Back',

    toastTransferCreated: 'Transfer order created',
    toastTransferCompleted: 'Transfer completed and stock moved',
    toastTransferCancelled: 'Transfer cancelled',

    // Server action errors — transfers
    errorSelectWarehouses: 'Select a source warehouse and a destination warehouse.',
    errorSameWarehouse: 'Cannot transfer to the same warehouse.',
    errorAtLeastOneLine: 'Add at least one line.',

    // ── Requests (stock load) ──────────────────────────────────────────────────
    requestsPageTitle: 'Load Requests',
    requestsPageDescription: 'Rep requests stock to be loaded from a warehouse into their van, pending warehouse keeper approval',

    newRequest: 'New Load Request',
    requestNeedWarning: 'You need a source warehouse, a van, and at least one product.',
    requestFormTitle: 'New Load Request',
    fromWarehouseLabel: 'From Warehouse *',
    toVanLabel: 'To Van *',

    addItem: 'Add Item',
    submitRequest: 'Submit Request',

    emptyRequests: 'No load requests yet.',

    requestStatusPending: 'Pending',
    requestStatusApproved: 'Approved & Loaded',
    requestStatusRejected: 'Rejected',
    requestStatusCancelled: 'Cancelled',

    approveLoad: 'Approve & Load',
    requestedLoadingDate: 'Requested loading date',
    approvedLoadingDate: 'Approved date',
    changeLoadingDate: 'Change date',
    dateChangeNote: 'Date change note',
    loadingDateSaved: 'Loading date updated.',
    rejectRequest: 'Reject',
    cancelRequest: 'Cancel',

    confirmApproveTitle: 'Approve & Load Request?',
    confirmApproveMessage: 'Quantities will be moved from the warehouse to the rep\'s van.',
    confirmApproveBtn: 'Approve & Load',

    toastRequestSent: 'Request submitted for approval',
    toastRequestApproved: 'Approved and stock moved to van',

    requestDirectionLabel: 'From {from} → To {to}',

    // Server action errors — requests
    errorSelectSourceAndVan: 'Select a source warehouse and a van.',
    errorSameSourceDest: 'Source and destination cannot be the same warehouse.',
    errorAtLeastOneItem: 'Add at least one item.',

    // ── Stock Count ────────────────────────────────────────────────────────────
    countPageTitle: 'Stock Count',
    countPageDescription: 'Count warehouse and van stock, identify shortages/surpluses and reconcile',

    warehouseOrVanLabel: 'Warehouse / Van',
    startNewCount: 'Start New Count',

    emptyCount: 'No stock counts yet.',

    colCountNo: 'Count #',
    colCountDate: 'Date',
    colCountStatus: 'Status',

    countStatusDraft: 'Draft',
    countStatusCompleted: 'Completed',
    countStatusCancelled: 'Cancelled',

    continueCount: 'Continue Count',
    viewCount: 'View',

    backToAllCounts: 'All Stock Counts',
    shortageLabel: 'Shortage: {n}',
    surplusLabel: 'Surplus: +{n}',
    searchCountProduct: 'Search product…',

    colBookQty: 'Book Qty',
    colActualQty: 'Actual (Counted)',
    colDiff: 'Variance',

    saveTempBtn: 'Save Draft',
    finalizeCountBtn: 'Finalize Count & Reconcile',
    cancelCountBtn: 'Cancel Count',

    confirmFinalizeTitle: 'Finalize Count?',
    confirmFinalizeMessage: 'Variance adjustments will be posted and stock balances updated. This cannot be undone.',
    confirmFinalizeBtn: 'Finalize',

    confirmCancelCountTitle: 'Cancel Count?',
    confirmCancelCountBtn: 'Cancel',
    confirmCancelCountBack: 'Go Back',

    toastCountCreated: 'Stock count created',
    toastCountSaved: 'Stock count saved',
    toastCountFinalized: 'Count finalized and balances reconciled',

    // Server action errors — count
    errorSelectWarehouse: 'Select a warehouse.',
    errorWarehouseNotFound: 'Warehouse not found.',

    // ── Low Stock ──────────────────────────────────────────────────────────────
    lowStockPageTitle: 'Low Stock Alerts',
    lowStockPageDescription: 'Items at or below the reorder level — review and reorder.',

    emptyLowStock: 'No items below the reorder level.',

    colCode: 'Code',
    colReorderLevel: 'Reorder Level',
    colDeficit: 'Deficit',

    statusOutOfStock: 'Out of Stock',

    // ── Expiry ─────────────────────────────────────────────────────────────────
    expiryPageTitle: 'Expiring Soon',
    expiryPageDescription: 'Received batches expiring within {days} days or already expired',

    emptyExpiry: 'No batches nearing expiry. (Expiry is recorded when purchase orders are received.)',

    colBatch: 'Batch',
    colExpiryDate: 'Expiry Date',

    statusExpired: 'Expired ({days} days)',
    statusExpiringSoon: 'In {days} days',
    statusExpiringDays: '{days} days',
  },
};
