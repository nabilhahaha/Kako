/** products module messages. Fill the namespace below; keep ar/en keys identical. */
export const ar = {
  products: {
    // Page header
    pageTitle: 'المنتجات',
    pageDescription: 'كتالوج المنتجات والأسعار والتصنيفات',

    // Toolbar buttons
    btnNewProduct: 'منتج جديد',
    btnCategories: 'التصنيفات ({count})',
    btnDrugCatalog: 'من قائمة الأدوية',

    // Search
    searchPlaceholder: 'بحث بالكود أو الاسم أو الباركود…',

    // Category section
    addCategoryHeading: 'إضافة تصنيف',
    categoryCodeLabel: 'الكود *',
    categoryNameArLabel: 'الاسم (عربي)',
    categoryNameEnLabel: 'الاسم (إنجليزي) *',
    categoryCodePlaceholder: 'BEV',
    categoryNameArPlaceholder: 'مشروبات',
    btnAddCategory: 'إضافة',

    // Product form
    formTitleNew: 'منتج جديد',
    formTitleEdit: 'تعديل: {name}',
    fieldProductCode: 'كود المنتج',
    fieldBarcode: 'الباركود',
    fieldCategory: 'التصنيف',
    fieldNameAr: 'الاسم (عربي)',
    fieldNameEn: 'الاسم (إنجليزي) *',
    fieldUnit: 'الوحدة',
    fieldCostPrice: 'سعر التكلفة',
    fieldSellPrice: 'سعر البيع',
    fieldTaxRate: 'ضريبة % (مثال: 14)',
    fieldMinStock: 'حد إعادة الطلب',
    fieldEtaCodeType: 'نوع كود الضرائب',
    fieldEtaItemCode: 'كود الصنف (ضرائب)',
    fieldEtaUnitType: 'وحدة القياس (ضرائب)',
    etaNone: 'بدون',
    productCodePlaceholder: 'يُولّد تلقائياً',
    noCategoryOption: 'بدون تصنيف',
    btnSave: 'حفظ',
    btnCancel: 'إلغاء',

    // Validation
    validationNameRequired: 'الاسم (إنجليزي) مطلوب.',

    // Table headers
    colCode: 'الكود',
    colProduct: 'المنتج',
    colCategory: 'التصنيف',
    colUnit: 'الوحدة',
    colCost: 'التكلفة',
    colSell: 'البيع',
    colStatus: 'الحالة',

    // Status badges
    statusActive: 'نشط',
    statusInactive: 'موقوف',

    // Row actions
    ariaEdit: 'تعديل',
    btnDeactivate: 'إيقاف',
    btnActivate: 'تفعيل',

    // Empty states
    emptyProducts: 'لا توجد منتجات بعد. أضف أول منتج.',
    emptyProductsHint: 'أنشئ أول منتج أو استورد كتالوجك للبدء.',
    emptySearch: 'لا توجد نتائج مطابقة.',

    // Toasts
    toastProductAdded: 'تمت إضافة المنتج',
    toastProductUpdated: 'تم تحديث المنتج',
    toastCategoryAdded: 'تمت إضافة التصنيف',
    toastError: 'حدث خطأ',

    // Server-action errors
    errorNoItems: 'لم يتم اختيار أي صنف.',
    errorNameRequired: 'اسم المنتج مطلوب.',
    errorCategoryRequired: 'كود واسم التصنيف مطلوبان.',

    // Drug catalog picker
    drugPickerTitle: 'إضافة أدوية من القائمة المصرية',
    drugPickerSearchPlaceholder: 'ابحث باسم الدواء (٣ حروف)…',
    drugPickerAriaClose: 'إغلاق',
    drugPickerAriaRemove: 'حذف',
    drugPickerSelectedLabel: 'المختارة ({count})',
    drugPickerBtnAdd: 'أضِف {count} للمخزون',
    drugPickerBtnAddEmpty: 'أضِف للمخزون',
    drugPickerBtnClose: 'إغلاق',
    drugPickerHint: 'يُضاف سعر السوق كسعر بيع مبدئي — راجِع التكلفة والتصنيف بعد الإضافة.',
    drugPickerToastAdded: 'تمت إضافة {count} صنف للمخزون',
    drugPickerToastError: 'حدث خطأ',
  },
};

export const en = {
  products: {
    // Page header
    pageTitle: 'Products',
    pageDescription: 'Product catalog, prices, and categories',

    // Toolbar buttons
    btnNewProduct: 'New Product',
    btnCategories: 'Categories ({count})',
    btnDrugCatalog: 'From Drug Catalog',

    // Search
    searchPlaceholder: 'Search by code, name, or barcode…',

    // Category section
    addCategoryHeading: 'Add Category',
    categoryCodeLabel: 'Code *',
    categoryNameArLabel: 'Name (Arabic)',
    categoryNameEnLabel: 'Name (English) *',
    categoryCodePlaceholder: 'BEV',
    categoryNameArPlaceholder: 'مشروبات',
    btnAddCategory: 'Add',

    // Product form
    formTitleNew: 'New Product',
    formTitleEdit: 'Edit: {name}',
    fieldProductCode: 'Product Code',
    fieldBarcode: 'Barcode',
    fieldCategory: 'Category',
    fieldNameAr: 'Name (Arabic)',
    fieldNameEn: 'Name (English) *',
    fieldUnit: 'Unit',
    fieldCostPrice: 'Cost Price',
    fieldSellPrice: 'Sell Price',
    fieldTaxRate: 'Tax % (e.g. 14)',
    fieldMinStock: 'Reorder Level',
    fieldEtaCodeType: 'Tax code type',
    fieldEtaItemCode: 'Item code (tax)',
    fieldEtaUnitType: 'Unit of measure (tax)',
    etaNone: 'None',
    productCodePlaceholder: 'Auto-generated',
    noCategoryOption: 'No Category',
    btnSave: 'Save',
    btnCancel: 'Cancel',

    // Validation
    validationNameRequired: 'English name is required.',

    // Table headers
    colCode: 'Code',
    colProduct: 'Product',
    colCategory: 'Category',
    colUnit: 'Unit',
    colCost: 'Cost',
    colSell: 'Sell',
    colStatus: 'Status',

    // Status badges
    statusActive: 'Active',
    statusInactive: 'Inactive',

    // Row actions
    ariaEdit: 'Edit',
    btnDeactivate: 'Deactivate',
    btnActivate: 'Activate',

    // Empty states
    emptyProducts: 'No products yet. Add the first product.',
    emptyProductsHint: 'Create your first product or import your catalog to get started.',
    emptySearch: 'No matching results.',

    // Toasts
    toastProductAdded: 'Product added',
    toastProductUpdated: 'Product updated',
    toastCategoryAdded: 'Category added',
    toastError: 'An error occurred',

    // Server-action errors
    errorNoItems: 'No items selected.',
    errorNameRequired: 'Product name is required.',
    errorCategoryRequired: 'Category code and name are required.',

    // Drug catalog picker
    drugPickerTitle: 'Import from Egyptian Drug Catalog',
    drugPickerSearchPlaceholder: 'Search drug name (3+ chars)…',
    drugPickerAriaClose: 'Close',
    drugPickerAriaRemove: 'Remove',
    drugPickerSelectedLabel: 'Selected ({count})',
    drugPickerBtnAdd: 'Add {count} to Inventory',
    drugPickerBtnAddEmpty: 'Add to Inventory',
    drugPickerBtnClose: 'Close',
    drugPickerHint: 'Market price is set as the initial sell price — review cost and category after import.',
    drugPickerToastAdded: '{count} items added to inventory',
    drugPickerToastError: 'An error occurred',
  },
};
