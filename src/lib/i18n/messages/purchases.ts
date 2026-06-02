/** purchases module messages – ar values are the original Arabic; en values are professional English translations. */

export const ar = {
  purchases: {
    // ── Page ────────────────────────────────────────────────────────────
    pageTitle: 'أوامر الشراء',
    pageDescription: 'طلبات الشراء واستلام البضاعة في المخزن',

    // ── Validation errors (server actions) ──────────────────────────────
    errBranchRequired: 'الفرع مطلوب.',
    errSupplierRequired: 'المورد مطلوب.',
    errAtLeastOneLine: 'أضف بنداً واحداً على الأقل.',
    errSelectWarehouse: 'اختر المخزن المستلِم.',

    // ── Generic toast ────────────────────────────────────────────────────
    errGeneric: 'حدث خطأ',

    // ── Toasts ───────────────────────────────────────────────────────────
    toastCreated: 'تم إنشاء أمر الشراء',
    toastCancelled: 'تم إلغاء الأمر',
    toastReceived: 'تم الاستلام وزيادة المخزون وترحيل قيد المخزون/الموردين',

    // ── Confirm dialog ───────────────────────────────────────────────────
    confirmCancelTitle: 'إلغاء أمر الشراء؟',
    confirmCancelBtn: 'إلغاء الأمر',
    confirmCancelBack: 'تراجع',

    // ── Toolbar buttons ──────────────────────────────────────────────────
    btnNewOrder: 'أمر شراء جديد',
    btnReceive: 'استلام',
    btnCancel: 'إلغاء',
    btnSaveOrder: 'حفظ الأمر',
    btnConfirmReceive: 'تأكيد الاستلام الكامل',

    // ── Create form ──────────────────────────────────────────────────────
    formNewOrderTitle: 'أمر شراء جديد',
    labelBranch: 'الفرع *',
    labelSupplier: 'المورد *',
    labelNotes: 'ملاحظات',
    placeholderChooseSupplier: 'اختر مورداً…',
    warnNeedData: 'تحتاج فرعاً ومورداً ومنتجاً واحداً على الأقل قبل إنشاء أمر شراء.',

    // ── Empty state ──────────────────────────────────────────────────────
    emptyOrders: 'لا توجد أوامر شراء بعد.',
    noResults: 'لا توجد نتائج مطابقة.',

    // ── Search ───────────────────────────────────────────────────────────
    searchPlaceholder: 'بحث برقم الأمر…',

    // ── Table headers ────────────────────────────────────────────────────
    colOrderNumber: 'رقم الأمر',
    colSupplier: 'المورد',
    colDate: 'التاريخ',
    colNet: 'الصافي',
    colStatus: 'الحالة',

    // ── Receive dialog ───────────────────────────────────────────────────
    receiveDialogTitle: 'استلام أمر الشراء {number}',
    labelReceivingWarehouse: 'المخزن المستلِم *',
    labelBatchDetails: 'تفاصيل التشغيلة والصلاحية (اختياري)',
    placeholderBatchNumber: 'رقم التشغيلة',
    titleExpiryDate: 'تاريخ الصلاحية',
    warnNoWarehouse: 'لا يوجد مخزن لهذا الفرع. أنشئ مخزناً أولاً.',
  },
};

export const en = {
  purchases: {
    // ── Page ────────────────────────────────────────────────────────────
    pageTitle: 'Purchase Orders',
    pageDescription: 'Purchase requests and goods receipt into stock',

    // ── Validation errors (server actions) ──────────────────────────────
    errBranchRequired: 'Branch is required.',
    errSupplierRequired: 'Supplier is required.',
    errAtLeastOneLine: 'Add at least one line item.',
    errSelectWarehouse: 'Please select a receiving warehouse.',

    // ── Generic toast ────────────────────────────────────────────────────
    errGeneric: 'An error occurred',

    // ── Toasts ───────────────────────────────────────────────────────────
    toastCreated: 'Purchase order created',
    toastCancelled: 'Order cancelled',
    toastReceived: 'Goods received — stock updated and inventory/payables entry posted',

    // ── Confirm dialog ───────────────────────────────────────────────────
    confirmCancelTitle: 'Cancel Purchase Order?',
    confirmCancelBtn: 'Cancel Order',
    confirmCancelBack: 'Go Back',

    // ── Toolbar buttons ──────────────────────────────────────────────────
    btnNewOrder: 'New Purchase Order',
    btnReceive: 'Receive',
    btnCancel: 'Cancel',
    btnSaveOrder: 'Save Order',
    btnConfirmReceive: 'Confirm Full Receipt',

    // ── Create form ──────────────────────────────────────────────────────
    formNewOrderTitle: 'New Purchase Order',
    labelBranch: 'Branch *',
    labelSupplier: 'Supplier *',
    labelNotes: 'Notes',
    placeholderChooseSupplier: 'Choose a supplier…',
    warnNeedData: 'You need at least one branch, supplier, and product before creating a purchase order.',

    // ── Empty state ──────────────────────────────────────────────────────
    emptyOrders: 'No purchase orders yet.',
    noResults: 'No matching results.',

    // ── Search ───────────────────────────────────────────────────────────
    searchPlaceholder: 'Search by order number…',

    // ── Table headers ────────────────────────────────────────────────────
    colOrderNumber: 'Order #',
    colSupplier: 'Supplier',
    colDate: 'Date',
    colNet: 'Net',
    colStatus: 'Status',

    // ── Receive dialog ───────────────────────────────────────────────────
    receiveDialogTitle: 'Receive Purchase Order {number}',
    labelReceivingWarehouse: 'Receiving Warehouse *',
    labelBatchDetails: 'Batch & Expiry Details (optional)',
    placeholderBatchNumber: 'Batch Number',
    titleExpiryDate: 'Expiry Date',
    warnNoWarehouse: 'No warehouse found for this branch. Create a warehouse first.',
  },
};
