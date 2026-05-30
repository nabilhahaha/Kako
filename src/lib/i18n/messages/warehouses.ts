/** warehouses module messages. Fill the namespace below; keep ar/en keys identical. */
export const ar = {
  warehouses: {
    // Page header
    pageTitle: 'المخازن',
    pageDescription: 'إدارة المخازن والسيارات لكل فرع',

    // Toolbar
    btnNewWarehouse: 'مخزن جديد',
    warnNoBranches: 'أنشئ فرعاً أولاً من إعدادات الفروع قبل إضافة مخزن.',

    // Warehouse form
    formTitleNew: 'مخزن جديد',
    formTitleEdit: 'تعديل: {name}',
    fieldBranch: 'الفرع *',
    fieldCode: 'كود المخزن *',
    fieldNameAr: 'الاسم (عربي)',
    fieldNameEn: 'الاسم (إنجليزي) *',
    fieldLocation: 'الموقع',
    branchPlaceholder: 'اختر فرعاً…',
    nameArPlaceholder: 'المخزن الرئيسي',
    checkboxIsVan: 'هذا مخزن سيارة (مندوب)',
    fieldAssignedTo: 'المندوب المسؤول عن السيارة',
    noRepOption: '— بدون —',
    btnSave: 'حفظ',
    btnCancel: 'إلغاء',

    // Card labels
    vanBadge: 'سيارة',
    inactiveBadge: 'موقوف',
    repLabel: 'المندوب: {name}',

    // Row actions
    ariaEdit: 'تعديل',
    btnDeactivate: 'إيقاف المخزن',
    btnActivate: 'تفعيل المخزن',

    // Empty state
    emptyWarehouses: 'لا توجد مخازن بعد.',

    // Toasts
    toastWarehouseAdded: 'تمت إضافة المخزن',
    toastWarehouseUpdated: 'تم تحديث المخزن',
    toastError: 'حدث خطأ',

    // Server-action errors
    errorBranchRequired: 'الفرع مطلوب.',
    errorCodeRequired: 'كود المخزن مطلوب.',
    errorNameRequired: 'اسم المخزن مطلوب.',
  },
};

export const en = {
  warehouses: {
    // Page header
    pageTitle: 'Warehouses',
    pageDescription: 'Manage warehouses and vans per branch',

    // Toolbar
    btnNewWarehouse: 'New Warehouse',
    warnNoBranches: 'Create a branch first in branch settings before adding a warehouse.',

    // Warehouse form
    formTitleNew: 'New Warehouse',
    formTitleEdit: 'Edit: {name}',
    fieldBranch: 'Branch *',
    fieldCode: 'Warehouse Code *',
    fieldNameAr: 'Name (Arabic)',
    fieldNameEn: 'Name (English) *',
    fieldLocation: 'Location',
    branchPlaceholder: 'Select a branch…',
    nameArPlaceholder: 'Main Warehouse',
    checkboxIsVan: 'This is a van warehouse (sales rep)',
    fieldAssignedTo: 'Assigned Rep',
    noRepOption: '— None —',
    btnSave: 'Save',
    btnCancel: 'Cancel',

    // Card labels
    vanBadge: 'Van',
    inactiveBadge: 'Inactive',
    repLabel: 'Rep: {name}',

    // Row actions
    ariaEdit: 'Edit',
    btnDeactivate: 'Deactivate',
    btnActivate: 'Activate',

    // Empty state
    emptyWarehouses: 'No warehouses yet.',

    // Toasts
    toastWarehouseAdded: 'Warehouse added',
    toastWarehouseUpdated: 'Warehouse updated',
    toastError: 'An error occurred',

    // Server-action errors
    errorBranchRequired: 'Branch is required.',
    errorCodeRequired: 'Warehouse code is required.',
    errorNameRequired: 'Warehouse name is required.',
  },
};
