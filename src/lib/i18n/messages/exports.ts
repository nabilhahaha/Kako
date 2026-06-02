/** exports module messages – ar values are the original Arabic; en values are professional English translations. */

export const ar = {
  exports: {
    // ── Page header ────────────────────────────────────────────────────────────
    pageTitle: 'تصدير البيانات',
    pageDescription: 'تصدير الحركات كبيانات خام (CSV يفتح في إكسل)',

    // ── Date range filter ──────────────────────────────────────────────────────
    labelFrom: 'من',
    labelTo: 'إلى',

    // ── Section labels ─────────────────────────────────────────────────────────
    sectionSales: 'المبيعات (الفواتير)',
    sectionPayments: 'التحصيلات',
    sectionInventory: 'حركات المخزون',
    sectionAccounting: 'القيود المحاسبية',
    sectionCustomers: 'العملاء (القائمة كاملة)',
    sectionProducts: 'المنتجات (القائمة كاملة)',

    // ── Button ─────────────────────────────────────────────────────────────────
    btnExportCsv: 'تصدير CSV',

    // ── Toasts / feedback ──────────────────────────────────────────────────────
    errorGeneric: 'حدث خطأ',
    errorNoData: 'لا توجد بيانات.',
    errorNoDataInRange: 'لا توجد بيانات في الفترة المحددة.',
    toastExported: 'تم تصدير {count} سجل',

    // ── Footer note ────────────────────────────────────────────────────────────
    footerNote: 'الملفات بصيغة CSV بترميز UTF-8 (تفتح مباشرة في Excel بالعربية). الحد الأقصى ٥٠٠٠ سطر لكل تصدير.',
  },
};

export const en = {
  exports: {
    // ── Page header ────────────────────────────────────────────────────────────
    pageTitle: 'Data Export',
    pageDescription: 'Export transactions as raw data (CSV, opens in Excel)',

    // ── Date range filter ──────────────────────────────────────────────────────
    labelFrom: 'From',
    labelTo: 'To',

    // ── Section labels ─────────────────────────────────────────────────────────
    sectionSales: 'Sales (Invoices)',
    sectionPayments: 'Collections / Payments',
    sectionInventory: 'Stock Movements',
    sectionAccounting: 'Journal Entries',
    sectionCustomers: 'Customers (Full List)',
    sectionProducts: 'Products (Full List)',

    // ── Button ─────────────────────────────────────────────────────────────────
    btnExportCsv: 'Export CSV',

    // ── Toasts / feedback ──────────────────────────────────────────────────────
    errorGeneric: 'An error occurred',
    errorNoData: 'No data available.',
    errorNoDataInRange: 'No data found for the selected period.',
    toastExported: '{count} record(s) exported',

    // ── Footer note ────────────────────────────────────────────────────────────
    footerNote: 'Files are UTF-8 CSV (open directly in Excel). Maximum 5,000 rows per export.',
  },
};
