/** Customer master-data (Segment / Classification / Channel) management —
 *  FMCG hierarchy S3. ar values are the source of truth; en mirrors them. */

export const ar = {
  customerData: {
    pageTitle: 'بيانات العملاء الأساسية',
    pageDescription: 'إدارة شرائح العملاء والتصنيفات والقنوات الخاصة بشركتك',
    superAdminOnly: 'هذه الصفحة متاحة لمن يملك صلاحية إدارة الحقول فقط.',
    addValue: 'إضافة قيمة',
    namePlaceholder: 'الاسم (إنجليزي)',
    nameArPlaceholder: 'الاسم (عربي)',
    empty: 'لا توجد قيم بعد.',
    activate: 'تفعيل',
    deactivate: 'إيقاف',
    inactive: 'موقوف',
    toastSaved: 'تم الحفظ',
    toastError: 'حدث خطأ',
  },
};

export const en = {
  customerData: {
    pageTitle: 'Customer Data',
    pageDescription: 'Manage your company’s customer segments, classifications, and channels',
    superAdminOnly: 'This page is available to users who can manage fields.',
    addValue: 'Add Value',
    namePlaceholder: 'Name (English)',
    nameArPlaceholder: 'Name (Arabic)',
    empty: 'No values yet.',
    activate: 'Activate',
    deactivate: 'Deactivate',
    inactive: 'Inactive',
    toastSaved: 'Saved',
    toastError: 'An error occurred',
  },
};
