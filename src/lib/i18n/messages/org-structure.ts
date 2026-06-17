/** Organization Structure builder messages (configurable org hierarchy).
 *  Business-friendly, non-technical labels per the Back Office UX standard —
 *  no "node", "RLS", "reports_to" or table names surface to the admin.
 *  Keep ar/en key sets identical. */
export const ar = {
  orgStructure: {
    pageTitle: 'هيكل المؤسسة',
    pageDescription: 'ابنِ مخطط مؤسستك: المناطق والفروع والفرق، ومن المسؤول عن كل وحدة.',
    adminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',

    // Tree controls
    expand: 'توسيع',
    collapse: 'طي',
    inactive: 'موقوف',
    inChargeName: 'المسؤول: {name}',
    noOneInCharge: 'لم يُعيَّن مسؤول بعد',

    // Row actions
    addUnderShort: 'إضافة وحدة فرعية',
    assignManager: 'تعيين المسؤول',
    rename: 'إعادة تسمية',
    move: 'نقل',
    deactivate: 'إيقاف',
    activate: 'تفعيل',
    delete: 'حذف',
    confirmDelete: 'هل تريد حذف «{name}»؟',

    // Editor titles
    addUnder: 'إضافة {level}',
    renameTitle: 'إعادة التسمية',
    whoInCharge: 'من المسؤول هنا؟',
    moveTitle: 'نقل إلى مكان آخر',

    // Fields
    nameEn: 'الاسم (إنجليزي)',
    nameAr: 'الاسم (عربي)',
    namePlaceholder: 'مثال: فرع القاهرة',
    person: 'الشخص',
    noOneOption: '— بدون مسؤول —',
    newParent: 'الوحدة الأعلى الجديدة',
    topLevelOption: '— المستوى الأعلى —',

    // Buttons
    save: 'حفظ',
    cancel: 'إلغاء',
    addTop: 'إضافة {level}',

    // Summary
    summaryLevels: 'المستويات',
    summaryUnits: 'الوحدات',
    summaryManaged: 'لها مسؤول',
    summaryActive: 'نشطة',

    // Search / empty
    searchPlaceholder: 'ابحث عن فرع أو منطقة أو فريق…',
    emptyTitle: 'لم يُجهَّز هيكل المؤسسة بعد',
    emptyDescription: 'سيظهر هيكلك هنا تلقائياً بمجرد إضافة المناطق والفروع.',
    noUnitsTitle: 'لا توجد وحدات بعد',
    noUnitsDescription: 'ابدأ بإضافة أول وحدة — مثال: فرع القاهرة.',

    toast: {
      added: 'تمت الإضافة',
      renamed: 'تم تحديث الاسم',
      managerSet: 'تم تحديث المسؤول',
      moved: 'تم النقل',
      activated: 'تم التفعيل',
      deactivated: 'تم الإيقاف',
      deleted: 'تم الحذف',
    },
    err: {
      generic: 'حدث خطأ',
      name_required: 'الاسم مطلوب.',
      would_create_cycle: 'لا يمكن نقل وحدة إلى داخل إحدى وحداتها الفرعية.',
      protected_seeded_node: 'لا يمكن حذف هذه الوحدة لأنها مرتبطة بفرع قائم.',
      unauthorized: 'غير مصرّح.',
    },
  },
};

export const en = {
  orgStructure: {
    pageTitle: 'Organization Structure',
    pageDescription: 'Build your org chart: regions, branches and teams, and who is in charge of each unit.',
    adminOnly: 'This page is available to the company admin only.',

    expand: 'Expand',
    collapse: 'Collapse',
    inactive: 'Inactive',
    inChargeName: 'In charge: {name}',
    noOneInCharge: 'No one in charge yet',

    addUnderShort: 'Add a unit inside',
    assignManager: 'Assign person in charge',
    rename: 'Rename',
    move: 'Move',
    deactivate: 'Deactivate',
    activate: 'Activate',
    delete: 'Delete',
    confirmDelete: 'Delete “{name}”?',

    addUnder: 'Add {level}',
    renameTitle: 'Rename',
    whoInCharge: 'Who is in charge here?',
    moveTitle: 'Move somewhere else',

    nameEn: 'Name (English)',
    nameAr: 'Name (Arabic)',
    namePlaceholder: 'e.g. Cairo Branch',
    person: 'Person',
    noOneOption: '— No one —',
    newParent: 'New parent unit',
    topLevelOption: '— Top level —',

    save: 'Save',
    cancel: 'Cancel',
    addTop: 'Add {level}',

    summaryLevels: 'Levels',
    summaryUnits: 'Units',
    summaryManaged: 'With a manager',
    summaryActive: 'Active',

    searchPlaceholder: 'Search a branch, region or team…',
    emptyTitle: 'Your structure isn’t set up yet',
    emptyDescription: 'Your structure appears here automatically once regions and branches are added.',
    noUnitsTitle: 'No units yet',
    noUnitsDescription: 'Start by adding your first unit — e.g. Cairo Branch.',

    toast: {
      added: 'Added',
      renamed: 'Name updated',
      managerSet: 'Person in charge updated',
      moved: 'Moved',
      activated: 'Activated',
      deactivated: 'Deactivated',
      deleted: 'Deleted',
    },
    err: {
      generic: 'Something went wrong',
      name_required: 'Name is required.',
      would_create_cycle: 'A unit can’t be moved inside one of its own sub-units.',
      protected_seeded_node: 'This unit can’t be deleted because it’s linked to an existing branch.',
      unauthorized: 'Unauthorized.',
    },
  },
};
