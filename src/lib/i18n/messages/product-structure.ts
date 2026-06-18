/** Product Structure builder messages (configurable product hierarchy).
 *  Business-friendly per the Back Office UX standard. Keep ar/en key sets
 *  identical. */
export const ar = {
  productStructure: {
    pageTitle: 'هيكل المنتجات',
    pageDescription: 'نظّم منتجاتك في فئات ومجموعات سهلة التصفّح.',
    adminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',

    expand: 'توسيع',
    collapse: 'طي',
    inactive: 'موقوف',

    addUnderShort: 'إضافة فئة فرعية',
    rename: 'إعادة تسمية',
    move: 'نقل',
    deactivate: 'إيقاف',
    activate: 'تفعيل',
    delete: 'حذف',
    confirmDelete: 'هل تريد حذف «{name}»؟',

    addUnder: 'إضافة {level}',
    renameTitle: 'إعادة التسمية',
    moveTitle: 'نقل إلى مكان آخر',

    nameEn: 'الاسم (إنجليزي)',
    nameAr: 'الاسم (عربي)',
    namePlaceholder: 'مثال: مشروبات',
    newParent: 'الفئة الأعلى الجديدة',
    topLevelOption: '— المستوى الأعلى —',

    save: 'حفظ',
    cancel: 'إلغاء',
    addTop: 'إضافة {level}',

    summaryLevels: 'المستويات',
    summaryCategories: 'الفئات',
    summaryActive: 'نشطة',

    searchPlaceholder: 'ابحث عن فئة…',
    emptyTitle: 'لم يُجهَّز هيكل المنتجات بعد',
    emptyDescription: 'سيظهر هيكل منتجاتك هنا تلقائياً بمجرد إضافة الفئات.',
    noItemsTitle: 'لا توجد فئات بعد',
    noItemsDescription: 'ابدأ بإضافة أول فئة — مثال: مشروبات.',

    toast: {
      added: 'تمت الإضافة',
      renamed: 'تم تحديث الاسم',
      moved: 'تم النقل',
      activated: 'تم التفعيل',
      deactivated: 'تم الإيقاف',
      deleted: 'تم الحذف',
    },
    err: {
      generic: 'حدث خطأ',
      name_required: 'الاسم مطلوب.',
      would_create_cycle: 'لا يمكن نقل فئة إلى داخل إحدى فئاتها الفرعية.',
      protected_seeded_node: 'لا يمكن حذف هذه الفئة لأنها مرتبطة بفئة منتجات قائمة.',
      unauthorized: 'غير مصرّح.',
    },
  },
};

export const en = {
  productStructure: {
    pageTitle: 'Product Structure',
    pageDescription: 'Organize your products into easy-to-browse categories and groups.',
    adminOnly: 'This page is available to the company admin only.',

    expand: 'Expand',
    collapse: 'Collapse',
    inactive: 'Inactive',

    addUnderShort: 'Add a sub-category',
    rename: 'Rename',
    move: 'Move',
    deactivate: 'Deactivate',
    activate: 'Activate',
    delete: 'Delete',
    confirmDelete: 'Delete “{name}”?',

    addUnder: 'Add {level}',
    renameTitle: 'Rename',
    moveTitle: 'Move somewhere else',

    nameEn: 'Name (English)',
    nameAr: 'Name (Arabic)',
    namePlaceholder: 'e.g. Beverages',
    newParent: 'New parent category',
    topLevelOption: '— Top level —',

    save: 'Save',
    cancel: 'Cancel',
    addTop: 'Add {level}',

    summaryLevels: 'Levels',
    summaryCategories: 'Categories',
    summaryActive: 'Active',

    searchPlaceholder: 'Search a category…',
    emptyTitle: 'Your product structure isn’t set up yet',
    emptyDescription: 'Your product structure appears here automatically once categories are added.',
    noItemsTitle: 'No categories yet',
    noItemsDescription: 'Start by adding your first category — e.g. Beverages.',

    toast: {
      added: 'Added',
      renamed: 'Name updated',
      moved: 'Moved',
      activated: 'Activated',
      deactivated: 'Deactivated',
      deleted: 'Deleted',
    },
    err: {
      generic: 'Something went wrong',
      name_required: 'Name is required.',
      would_create_cycle: 'A category can’t be moved inside one of its own sub-categories.',
      protected_seeded_node: 'This category can’t be deleted because it’s linked to an existing product category.',
      unauthorized: 'Unauthorized.',
    },
  },
};
