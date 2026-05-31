/** restaurant module messages. Fill the namespace below; keep ar/en keys identical. */
export const ar = {
  restaurant: {
    // ── Shared / general ──────────────────────────────────────────────────
    noCompany: 'إدارة المطعم تتم من داخل حساب المطعم.',
    errorGeneric: 'حدث خطأ',
    menuItemsLabel: 'أصناف',

    // ── Order types ───────────────────────────────────────────────────────
    orderType: {
      dine_in: 'صالة',
      takeaway: 'تيك أواي',
      delivery: 'دليفري',
    },

    // ── Kitchen status labels ─────────────────────────────────────────────
    kitchenStatus: {
      new: 'جديد',
      preparing: 'تحضير',
      ready: 'جاهز',
    },

    // ── Dashboard ─────────────────────────────────────────────────────────
    dashboard: {
      title: 'لوحة المطعم / الكافيه',
      titleNoCompany: 'لوحة المطعم',
      description: 'نظرة سريعة على نشاط اليوم.',
      gsMenuItems: 'أضف أصناف المنيو',
      gsTables: 'جهّز الطاولات',
      gsFirstOrder: 'سجّل أول أوردر',
      statSales: 'مبيعات اليوم',
      statOpenOrders: 'أوردرات مفتوحة',
      statOccupiedTables: 'طاولات مشغولة',
      statKitchenItems: 'أصناف في المطبخ',
      btnOrders: 'الأوردرات',
      btnDayClosing: 'تقفيل اليوم',
      btnTables: 'الطاولات',
      btnKitchen: 'شاشة المطبخ',
    },

    // ── Tables page ───────────────────────────────────────────────────────
    tables: {
      title: 'الطاولات',
      description: 'خريطة الصالة — اضغط طاولة لفتح أوردرها.',
      manageTables: 'إدارة الطاولات',
      newTable: 'طاولة جديدة',
      fieldName: 'اسم/رقم الطاولة *',
      namePlaceholder: 'طاولة 1',
      fieldSeats: 'عدد الكراسي',
      save: 'حفظ',
      cancel: 'إلغاء',
      empty: 'لا توجد طاولات. فعّل «إدارة الطاولات» وأضف أول طاولة.',
      statusOccupied: 'مشغولة',
      statusFree: 'فاضية',
      openOrder: 'فتح الأوردر',
      openTable: 'فتح طاولة',
      tableLabel: 'طاولة {name}',
      toastSaved: 'تم الحفظ',
      errorOpenOrder: 'تعذّر فتح الأوردر',
    },

    // ── Orders page ───────────────────────────────────────────────────────
    orders: {
      title: 'الأوردرات المفتوحة',
      titleNoCompany: 'الأوردرات',
      description: 'افتح أوردر جديد أو أكمل أوردراً قائماً.',
      btnNewTakeaway: 'تيك أواي جديد',
      btnNewDelivery: 'دليفري جديد',
      empty: 'لا توجد أوردرات مفتوحة. افتح طاولة أو أوردر تيك أواي.',
      tableLabel: 'طاولة {name}',
      itemCount: '{count} صنف',
      errorOpenOrder: 'تعذّر فتح الأوردر',
    },

    // ── Order editor ──────────────────────────────────────────────────────
    editor: {
      backToOrders: 'الأوردرات',
      tableLabel: 'طاولة {name}',
      statusClosed: 'مغلق',
      closedNotice: 'هذا الأوردر {status} — للعرض فقط.',
      statusCancelled: 'ملغي',
      emptyMenu: 'لا توجد أصناف في المنيو. أضِف منتجات من صفحة المنتجات.',
      emptyItems: 'لا أصناف بعد — اختر من المنيو.',
      // Delivery / meta form
      fieldCustomerName: 'اسم العميل',
      fieldPhone: 'الهاتف',
      fieldAddress: 'العنوان',
      fieldDeliveryFee: 'رسوم التوصيل',
      fieldDiscount: 'الخصم',
      discountAmount: 'ج.م',
      fieldService: 'خدمة %',
      fieldTax: 'ضريبة %',
      save: 'حفظ',
      close: 'إغلاق',
      // Totals
      subtotal: 'الإجمالي الفرعي',
      discount: 'الخصم',
      deliveryFee: 'رسوم التوصيل',
      serviceLine: 'خدمة {rate}%',
      taxLine: 'ضريبة {rate}%',
      total: 'الإجمالي',
      adjustBtn: 'خصم / خدمة / ضريبة',
      adjustBtnWithCustomer: 'خصم / خدمة / ضريبة / عميل',
      checkoutLabel: 'تحصيل وإغلاق',
      printLabel: 'طباعة الفاتورة',
      // Notes prompt
      noteTitle: 'ملاحظة: {name}',
      noteLabel: 'مثال: بدون بصل / زيادة جبنة',
      noteConfirm: 'حفظ',
      // Toasts
      toastCheckedOut: 'تم تحصيل الأوردر وإغلاقه',
      toastCancelled: 'تم إلغاء الأوردر',
      toastMetaSaved: 'تم حفظ الحساب',
      toastNoteSaved: 'تم حفظ الملاحظة',
      errorGeneric: 'حدث خطأ',
    },

    // ── Kitchen board ─────────────────────────────────────────────────────
    kitchen: {
      title: 'شاشة المطبخ',
      titleNoCompany: 'المطبخ',
      description: 'الأصناف المطلوب تحضيرها — علّم كل صنف عند بدء التحضير وعند الجاهزية.',
      empty: 'لا أصناف في المطبخ حالياً.',
      tableLabel: 'طاولة {name}',
      btnPreparing: 'تحضير',
      btnReady: 'جاهز',
      toastPreparing: 'بدأ التحضير',
      toastReady: 'جاهز',
      errorGeneric: 'حدث خطأ',
    },

    // ── Actions / server error strings ────────────────────────────────────
    actions: {
      noCompany: 'هذه العملية تتم من داخل حساب المطعم.',
      tableNameRequired: 'اسم/رقم الطاولة مطلوب.',
      itemNotFound: 'الصنف غير موجود.',
      invalidStatus: 'حالة غير صحيحة.',
      orderRequired: 'الأوردر مطلوب.',
      cannotCancelClosed: 'لا يمكن إلغاء أوردر مغلق.',
    },
  },
};

export const en = {
  restaurant: {
    // ── Shared / general ──────────────────────────────────────────────────
    noCompany: 'Restaurant management is handled inside the restaurant account.',
    errorGeneric: 'An error occurred',
    menuItemsLabel: 'Items',

    // ── Order types ───────────────────────────────────────────────────────
    orderType: {
      dine_in: 'Dine-in',
      takeaway: 'Takeaway',
      delivery: 'Delivery',
    },

    // ── Kitchen status labels ─────────────────────────────────────────────
    kitchenStatus: {
      new: 'New',
      preparing: 'Preparing',
      ready: 'Ready',
    },

    // ── Dashboard ─────────────────────────────────────────────────────────
    dashboard: {
      title: 'Restaurant / Café Dashboard',
      titleNoCompany: 'Restaurant Dashboard',
      description: "Quick overview of today's activity.",
      gsMenuItems: 'Add menu items',
      gsTables: 'Set up tables',
      gsFirstOrder: 'Place first order',
      statSales: "Today's Sales",
      statOpenOrders: 'Open Orders',
      statOccupiedTables: 'Occupied Tables',
      statKitchenItems: 'Kitchen Items',
      btnOrders: 'Orders',
      btnDayClosing: 'Day Closing',
      btnTables: 'Tables',
      btnKitchen: 'Kitchen Display',
    },

    // ── Tables page ───────────────────────────────────────────────────────
    tables: {
      title: 'Tables',
      description: 'Floor map — tap a table to open its order.',
      manageTables: 'Manage Tables',
      newTable: 'New Table',
      fieldName: 'Table Name / Number *',
      namePlaceholder: 'Table 1',
      fieldSeats: 'Seats',
      save: 'Save',
      cancel: 'Cancel',
      empty: 'No tables yet. Enable "Manage Tables" and add your first table.',
      statusOccupied: 'Occupied',
      statusFree: 'Free',
      openOrder: 'Open Order',
      openTable: 'Open Table',
      tableLabel: 'Table {name}',
      toastSaved: 'Saved',
      errorOpenOrder: 'Could not open order',
    },

    // ── Orders page ───────────────────────────────────────────────────────
    orders: {
      title: 'Open Orders',
      titleNoCompany: 'Orders',
      description: 'Start a new order or continue an existing one.',
      btnNewTakeaway: 'New Takeaway',
      btnNewDelivery: 'New Delivery',
      empty: 'No open orders. Open a table or start a takeaway order.',
      tableLabel: 'Table {name}',
      itemCount: '{count} item(s)',
      errorOpenOrder: 'Could not open order',
    },

    // ── Order editor ──────────────────────────────────────────────────────
    editor: {
      backToOrders: 'Orders',
      tableLabel: 'Table {name}',
      statusClosed: 'Closed',
      closedNotice: 'This order is {status} — view only.',
      statusCancelled: 'Cancelled',
      emptyMenu: 'No menu items found. Add products from the Products page.',
      emptyItems: 'No items yet — pick from the menu.',
      // Delivery / meta form
      fieldCustomerName: 'Customer Name',
      fieldPhone: 'Phone',
      fieldAddress: 'Address',
      fieldDeliveryFee: 'Delivery Fee',
      fieldDiscount: 'Discount',
      discountAmount: 'EGP',
      fieldService: 'Service %',
      fieldTax: 'Tax %',
      save: 'Save',
      close: 'Close',
      // Totals
      subtotal: 'Subtotal',
      discount: 'Discount',
      deliveryFee: 'Delivery Fee',
      serviceLine: 'Service {rate}%',
      taxLine: 'Tax {rate}%',
      total: 'Total',
      adjustBtn: 'Discount / Service / Tax',
      adjustBtnWithCustomer: 'Discount / Service / Tax / Customer',
      checkoutLabel: 'Checkout & Close',
      printLabel: 'Print Receipt',
      // Notes prompt
      noteTitle: 'Note: {name}',
      noteLabel: 'e.g. No onions / extra cheese',
      noteConfirm: 'Save',
      // Toasts
      toastCheckedOut: 'Order checked out and closed',
      toastCancelled: 'Order cancelled',
      toastMetaSaved: 'Settings saved',
      toastNoteSaved: 'Note saved',
      errorGeneric: 'An error occurred',
    },

    // ── Kitchen board ─────────────────────────────────────────────────────
    kitchen: {
      title: 'Kitchen Display',
      titleNoCompany: 'Kitchen',
      description: 'Items to prepare — mark each item when you start and when it is ready.',
      empty: 'No items in the kitchen right now.',
      tableLabel: 'Table {name}',
      btnPreparing: 'Preparing',
      btnReady: 'Ready',
      toastPreparing: 'Started preparing',
      toastReady: 'Ready',
      errorGeneric: 'An error occurred',
    },

    // ── Actions / server error strings ────────────────────────────────────
    actions: {
      noCompany: 'This action must be performed inside the restaurant account.',
      tableNameRequired: 'Table name / number is required.',
      itemNotFound: 'Item not found.',
      invalidStatus: 'Invalid status.',
      orderRequired: 'Order is required.',
      cannotCancelClosed: 'Cannot cancel a closed order.',
    },
  },
};
