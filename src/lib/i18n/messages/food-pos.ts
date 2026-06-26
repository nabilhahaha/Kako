// Fast Food / Restaurant POS — i18n namespace (foodPos). Built ON TOP of the existing
// restaurant module (orders/items/checkout) + product catalog + scanner + receipt, so this
// namespace only covers the new fast POS surface. AR-first (RTL), EN parallel.

export const ar = {
  foodPos: {
    title: 'نقطة البيع', subtitle: 'بيع سريع للمطاعم والوجبات السريعة',
    search: 'بحث بالاسم أو الباركود…', scan: 'مسح', manualBarcode: 'إدخال باركود', allCategories: 'الكل',
    refresh: 'تحديث', back: 'رجوع', close: 'إغلاق', loading: 'جارٍ التحميل…',
    fullscreen: 'ملء الشاشة', offline: 'لا يوجد اتصال — البيع يعمل دون اتصال وتتم المزامنة عند عودة الإنترنت', offlinePay: 'الدفع غير متاح بدون اتصال',
    pendingSync: 'بانتظار المزامنة', tempNo: 'رقم مؤقت',
    // order modes
    dineIn: 'صالة', takeaway: 'سفري', delivery: 'توصيل',
    table: 'طاولة', selectTable: 'اختر طاولة', noTables: 'لا توجد طاولات',
    customerName: 'اسم العميل', customerPhone: 'الهاتف', customerAddress: 'العنوان', deliveryFee: 'رسوم التوصيل',
    // cart / ticket
    cart: 'الطلب', cartEmpty: 'أضِف أصنافًا للبدء', clear: 'مسح', clearConfirm: 'مسح الطلب بالكامل؟',
    qty: 'الكمية', remove: 'حذف', itemNote: 'ملاحظة الصنف', orderNote: 'ملاحظة الطلب', notePlaceholder: 'مثال: بدون بصل…',
    hold: 'تعليق', held: 'تم تعليق الطلب', resume: 'استئناف', heldOrders: 'طلبات معلّقة',
    // totals
    subtotal: 'الإجمالي الفرعي', discount: 'الخصم', tax: 'الضريبة', service: 'الخدمة', total: 'الإجمالي', itemsCount: '{n} صنف',
    // payment
    pay: 'الدفع', cash: 'كاش', card: 'بطاقة', mixed: 'مختلط',
    tendered: 'المبلغ المدفوع', change: 'الباقي', balanceDue: 'المتبقّي', quickCash: 'مبالغ سريعة', exact: 'بالضبط',
    cashPart: 'كاش', cardPart: 'بطاقة',
    complete: 'إتمام الدفع', completing: 'جارٍ الإتمام…', paid: 'تم الدفع', newOrder: 'طلب جديد', printReceipt: 'طباعة الفاتورة',
    // badges
    outOfStock: 'غير متوفر', bestSeller: 'الأكثر مبيعًا',
    // scan feedback
    scanAdded: 'تمت الإضافة', scanQtyUp: 'تم رفع الكمية', notFound: 'الباركود غير موجود: {code}',
    multiMatch: 'عدة نتائج — اختر الصنف', chooseProduct: 'اختر صنفًا',
    // errors
    err: 'حدث خطأ. حاول مرة أخرى.', errNoItems: 'الطلب فارغ', errPayment: 'تعذّر إتمام الدفع',
  },
  foodPosReports: {
    title: 'تقارير المبيعات', subtitle: 'ملخص مبيعات نقطة البيع', back: 'رجوع', refresh: 'تحديث', export: 'تصدير Excel',
    date_today: 'اليوم', date_week: 'هذا الأسبوع', date_month: 'هذا الشهر',
    kpiOrders: 'الطلبات', kpiRevenue: 'الإيراد', kpiAvgTicket: 'متوسط الفاتورة', kpiItems: 'الأصناف المباعة',
    tab_summary: 'ملخص', tab_byCashier: 'حسب الكاشير', tab_byProduct: 'حسب الصنف', tab_byCategory: 'حسب الفئة',
    tab_byPayment: 'طريقة الدفع', tab_byMode: 'نوع الطلب', tab_hourly: 'حسب الساعة', tab_top: 'الأكثر مبيعًا',
    colCashier: 'الكاشير', colProduct: 'الصنف', colCategory: 'الفئة', colMethod: 'الطريقة', colMode: 'النوع',
    colHour: 'الساعة', colOrders: 'الطلبات', colQty: 'الكمية', colRevenue: 'الإيراد',
    empty: 'لا توجد مبيعات في هذه الفترة.',
    mode_dine_in: 'صالة', mode_takeaway: 'سفري', mode_delivery: 'توصيل', method_cash: 'كاش', method_card: 'بطاقة',
    sheet: 'المبيعات',
  },
  foodPosSetup: {
    title: 'إعداد نقطة البيع', subtitle: 'الأصناف والصور والفئات', back: 'رجوع',
    products: 'الأصناف', categories: 'الفئات', image: 'الصورة', uploadImage: 'رفع صورة', uploading: 'جارٍ الرفع…',
    barcode: 'الباركود', price: 'السعر', active: 'مُفعّل', noImage: 'بدون صورة', saved: 'تم الحفظ',
    search: 'بحث عن صنف', empty: 'لا توجد أصناف.', imageHint: 'صورة مربعة واضحة تظهر في شبكة نقطة البيع.',
  },
  // Dedicated POS shell — sidebar nav + compact top bar.
  foodPosNav: {
    pos: 'نقطة البيع', orders: 'الطلبات', shift: 'ملخص الوردية', reports: 'التقارير',
    setup: 'الإعداد والأصناف', help: 'مساعدة', backOffice: 'لوحة الإدارة', logout: 'تسجيل الخروج',
  },
  foodPosShell: {
    posMode: 'وضع نقطة البيع', online: 'متصل', offline: 'دون اتصال', syncing: 'جارٍ المزامنة…', synced: 'تمت المزامنة',
    pendingSync: 'بانتظار المزامنة', shiftOpen: 'وردية مفتوحة', cashier: 'الكاشير', branch: 'الفرع',
    help: 'مساعدة', logout: 'خروج', menu: 'القائمة', close: 'إغلاق',
  },
  foodPosOrders: {
    title: 'الطلبات الأخيرة', subtitle: 'آخر فواتير نقطة البيع', back: 'رجوع', refresh: 'تحديث',
    empty: 'لا توجد طلبات بعد.', number: 'رقم الفاتورة', time: 'الوقت', mode: 'النوع', method: 'الدفع',
    total: 'الإجمالي', status: 'الحالة', view: 'عرض', today: 'اليوم', recent: 'الأحدث',
    mode_dine_in: 'صالة', mode_takeaway: 'سفري', mode_delivery: 'توصيل', method_cash: 'كاش', method_card: 'بطاقة', method_mixed: 'مختلط',
    status_issued: 'صادرة', status_voided: 'ملغاة', status_credit_note: 'إشعار دائن',
  },
  foodPosShift: {
    title: 'ملخص الوردية', subtitle: 'مبيعاتك اليوم', back: 'رجوع', refresh: 'تحديث',
    orders: 'الطلبات', revenue: 'الإيراد', avgTicket: 'متوسط الفاتورة', items: 'الأصناف المباعة',
    byMethod: 'حسب طريقة الدفع', byMode: 'حسب نوع الطلب', cash: 'كاش', card: 'بطاقة', mixed: 'مختلط',
    dineIn: 'صالة', takeaway: 'سفري', delivery: 'توصيل', empty: 'لا توجد مبيعات في ورديتك اليوم.',
    since: 'منذ', cashier: 'الكاشير', you: 'أنت',
  },
};

export const en = {
  foodPos: {
    title: 'Point of Sale', subtitle: 'Fast selling for restaurants & quick service',
    search: 'Search by name or barcode…', scan: 'Scan', manualBarcode: 'Enter barcode', allCategories: 'All',
    refresh: 'Refresh', back: 'Back', close: 'Close', loading: 'Loading…',
    fullscreen: 'Full screen', offline: 'You are offline — sales continue locally and sync when the connection returns', offlinePay: 'Payment is unavailable offline',
    pendingSync: 'Pending sync', tempNo: 'Temp no.',
    dineIn: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery',
    table: 'Table', selectTable: 'Select a table', noTables: 'No tables',
    customerName: 'Customer name', customerPhone: 'Phone', customerAddress: 'Address', deliveryFee: 'Delivery fee',
    cart: 'Order', cartEmpty: 'Add items to start', clear: 'Clear', clearConfirm: 'Clear the whole order?',
    qty: 'Qty', remove: 'Remove', itemNote: 'Item note', orderNote: 'Order note', notePlaceholder: 'e.g. no onions…',
    hold: 'Hold', held: 'Order held', resume: 'Resume', heldOrders: 'Held orders',
    subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax', service: 'Service', total: 'Total', itemsCount: '{n} items',
    pay: 'Pay', cash: 'Cash', card: 'Card', mixed: 'Mixed',
    tendered: 'Tendered', change: 'Change', balanceDue: 'Balance', quickCash: 'Quick cash', exact: 'Exact',
    cashPart: 'Cash', cardPart: 'Card',
    complete: 'Complete payment', completing: 'Completing…', paid: 'Paid', newOrder: 'New order', printReceipt: 'Print receipt',
    outOfStock: 'Out of stock', bestSeller: 'Best seller',
    scanAdded: 'Added', scanQtyUp: 'Qty increased', notFound: 'Barcode not found: {code}',
    multiMatch: 'Multiple matches — pick an item', chooseProduct: 'Choose a product',
    err: 'Something went wrong. Please try again.', errNoItems: 'The order is empty', errPayment: 'Could not complete payment',
  },
  foodPosReports: {
    title: 'Sales reports', subtitle: 'POS sales summary', back: 'Back', refresh: 'Refresh', export: 'Export Excel',
    date_today: 'Today', date_week: 'This week', date_month: 'This month',
    kpiOrders: 'Orders', kpiRevenue: 'Revenue', kpiAvgTicket: 'Avg ticket', kpiItems: 'Items sold',
    tab_summary: 'Summary', tab_byCashier: 'By cashier', tab_byProduct: 'By product', tab_byCategory: 'By category',
    tab_byPayment: 'Payment method', tab_byMode: 'Order type', tab_hourly: 'Hourly', tab_top: 'Top items',
    colCashier: 'Cashier', colProduct: 'Product', colCategory: 'Category', colMethod: 'Method', colMode: 'Type',
    colHour: 'Hour', colOrders: 'Orders', colQty: 'Qty', colRevenue: 'Revenue',
    empty: 'No sales in this period.',
    mode_dine_in: 'Dine-in', mode_takeaway: 'Takeaway', mode_delivery: 'Delivery', method_cash: 'Cash', method_card: 'Card',
    sheet: 'Sales',
  },
  foodPosSetup: {
    title: 'POS setup', subtitle: 'Products, photos & categories', back: 'Back',
    products: 'Products', categories: 'Categories', image: 'Image', uploadImage: 'Upload image', uploading: 'Uploading…',
    barcode: 'Barcode', price: 'Price', active: 'Active', noImage: 'No image', saved: 'Saved',
    search: 'Search a product', empty: 'No products.', imageHint: 'A clear square photo shown in the POS grid.',
  },
  // Dedicated POS shell — sidebar nav + compact top bar.
  foodPosNav: {
    pos: 'Point of Sale', orders: 'Orders', shift: 'Shift Summary', reports: 'Reports',
    setup: 'Setup & Items', help: 'Help', backOffice: 'Back office', logout: 'Log out',
  },
  foodPosShell: {
    posMode: 'POS mode', online: 'Online', offline: 'Offline', syncing: 'Syncing…', synced: 'Synced',
    pendingSync: 'Pending sync', shiftOpen: 'Shift open', cashier: 'Cashier', branch: 'Branch',
    help: 'Help', logout: 'Log out', menu: 'Menu', close: 'Close',
  },
  foodPosOrders: {
    title: 'Recent orders', subtitle: 'Latest POS invoices', back: 'Back', refresh: 'Refresh',
    empty: 'No orders yet.', number: 'Invoice', time: 'Time', mode: 'Type', method: 'Payment',
    total: 'Total', status: 'Status', view: 'View', today: 'Today', recent: 'Recent',
    mode_dine_in: 'Dine-in', mode_takeaway: 'Takeaway', mode_delivery: 'Delivery', method_cash: 'Cash', method_card: 'Card', method_mixed: 'Mixed',
    status_issued: 'Issued', status_voided: 'Voided', status_credit_note: 'Credit note',
  },
  foodPosShift: {
    title: 'Shift summary', subtitle: 'Your sales today', back: 'Back', refresh: 'Refresh',
    orders: 'Orders', revenue: 'Revenue', avgTicket: 'Avg ticket', items: 'Items sold',
    byMethod: 'By payment method', byMode: 'By order type', cash: 'Cash', card: 'Card', mixed: 'Mixed',
    dineIn: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery', empty: 'No sales in your shift today.',
    since: 'Since', cashier: 'Cashier', you: 'You',
  },
};
