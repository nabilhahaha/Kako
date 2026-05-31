/** Generic Export Engine messages. ar/en keys identical. Namespace: dataExport
 *  (the `exports` namespace is owned by the accounting/reports exports page). */
export const ar = {
  dataExport: {
    title: 'تصدير البيانات',
    subtitle: 'صدّر أي وحدة (عملاء، منتجات، موردين، فروع…) إلى CSV أو Excel أو JSON.',
    empty: 'لا توجد بيانات متاحة للتصدير بصلاحياتك الحالية.',
    entity: {
      title: 'اختر نوع البيانات المراد تصديرها',
      fieldsCount: '{count} حقل',
    },
    columns: {
      title: 'الأعمدة التي سيتم تصديرها',
    },
    filters: {
      title: 'الفلاتر (اختياري)',
      hint: 'يتم تطبيق الفلاتر على التصدير بنفس صلاحياتك ونطاق شركتك.',
      search: 'بحث',
      searchPlaceholder: 'بحث في الاسم/الهاتف/البريد…',
      status: 'الحالة',
      statusPlaceholder: 'مثال: active',
      limit: 'الحد الأقصى للصفوف',
      preview: 'معاينة العدد',
      matchCount: 'سيتم تصدير {count} صف',
    },
    format: {
      title: 'صيغة الملف',
      csv: 'CSV',
      xlsx: 'Excel (.xlsx)',
      json: 'JSON',
    },
    download: 'تصدير وتنزيل',
    toast: {
      selectEntity: 'اختر نوع البيانات أولًا',
      started: 'بدأ التنزيل…',
      previewError: 'تعذّر حساب العدد',
    },
  },
};

export const en = {
  dataExport: {
    title: 'Data Export',
    subtitle: 'Export any module (customers, products, suppliers, branches…) to CSV, Excel, or JSON.',
    empty: 'No data is available to export with your current permissions.',
    entity: {
      title: 'Choose the type of data to export',
      fieldsCount: '{count} fields',
    },
    columns: {
      title: 'Columns that will be exported',
    },
    filters: {
      title: 'Filters (optional)',
      hint: 'Filters are applied to the export with your own permissions and company scope.',
      search: 'Search',
      searchPlaceholder: 'Search name/phone/email…',
      status: 'Status',
      statusPlaceholder: 'e.g. active',
      limit: 'Max rows',
      preview: 'Preview count',
      matchCount: '{count} rows will be exported',
    },
    format: {
      title: 'File format',
      csv: 'CSV',
      xlsx: 'Excel (.xlsx)',
      json: 'JSON',
    },
    download: 'Export & download',
    toast: {
      selectEntity: 'Select an entity first',
      started: 'Download started…',
      previewError: 'Could not compute the count',
    },
  },
};
