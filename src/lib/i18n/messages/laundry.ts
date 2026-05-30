/** laundry module messages. Keep ar/en keys identical. */
export const ar = {
  laundry: {
    // ── Shared / no-company ───────────────────────────────────────────────
    noCompany: 'إدارة المغسلة تتم من داخل حساب المغسلة.',

    // ── Dashboard ─────────────────────────────────────────────────────────
    dashboard: {
      title: 'لوحة المغسلة',
      description: 'نظرة سريعة على الطلبات والتحصيل.',
      ordersLink: 'الطلبات',
      gsServices: 'عرّف الأصناف والأسعار',
      gsFirstOrder: 'سجّل أول طلب',
      statSalesToday: 'مبيعات اليوم',
      statReceived: 'قيد الاستلام',
      statWashing: 'تحت الغسيل',
      statReady: 'جاهز للتسليم',
    },

    // ── Services (price list) ─────────────────────────────────────────────
    services: {
      title: 'الأصناف والأسعار',
      description: 'قائمة الأصناف (قميص/بنطلون/بدلة/غسيل عادي…) بأسعارها.',
      entityLabel: 'صنف',
      namePlaceholder: 'قميص / بنطلون / بدلة',
    },

    // ── Orders list ───────────────────────────────────────────────────────
    orders: {
      title: 'طلبات المغسلة',
      titleShort: 'الطلبات',
      description: 'استلام، غسيل، جاهز، ثم تسليم وتحصيل.',
      newButton: 'طلب جديد',
      openOrderButton: 'فتح الطلب',
      cancelButton: 'إلغاء',
      empty: 'لا توجد طلبات.',
      failedToOpen: 'تعذّر فتح الطلب',
      // New order form
      labelCustomerName: 'اسم العميل',
      placeholderCustomerName: 'اسم العميل',
      labelPhone: 'الهاتف',
      labelDelivery: 'توصيل للمنزل',
      // Order card
      fallbackCustomer: 'عميل',
      itemCount: '{count} قطعة',
      dueDate: 'تسليم {date}',
    },

    // ── Order status labels ───────────────────────────────────────────────
    status: {
      received: 'استلام',
      washing: 'غسيل',
      ready: 'جاهز',
      delivered: 'تم التسليم',
      cancelled: 'ملغي',
    },

    // ── Status filter tabs ────────────────────────────────────────────────
    filter: {
      all: 'الكل',
      received: 'استلام',
      washing: 'غسيل',
      ready: 'جاهز',
    },

    // ── Order editor ──────────────────────────────────────────────────────
    editor: {
      backLink: 'الطلبات',
      fallbackTitle: 'طلب مغسلة',
      // Workflow buttons / messages
      startWashing: 'بدء الغسيل',
      toastWashingStarted: 'بدأ الغسيل',
      markReady: 'جاهز للتسليم',
      toastReady: 'الطلب جاهز',
      orderReadyHint: 'الطلب جاهز — سلّم وحصّل بالأسفل.',
      // Closed / no-services states
      closedOrder: 'هذا الطلب {state} — للعرض فقط.',
      closedStateCancelled: 'ملغي',
      closedStateDelivered: 'تم تسليمه',
      noServices: 'لا توجد أصناف. أضِف من صفحة الأصناف والأسعار.',
      // Meta form
      labelCustomerName: 'اسم العميل',
      labelPhone: 'الهاتف',
      labelAddress: 'العنوان',
      labelDueDate: 'موعد التسليم',
      labelDelivery: 'توصيل',
      labelDeliveryFee: 'رسوم التوصيل',
      labelDiscount: 'الخصم',
      saveButton: 'حفظ',
      closeButton: 'إغلاق',
      toastSaved: 'تم الحفظ',
      // Items list
      noItemsYet: 'لا قطع بعد — اختر من القائمة.',
      // Totals
      subtotal: 'الإجمالي الفرعي',
      discount: 'الخصم',
      deliveryFee: 'رسوم التوصيل',
      total: 'الإجمالي',
      adjustLink: 'العميل / التوصيل / الخصم / الموعد',
      // Checkout footer props
      checkoutLabel: 'تسليم وتحصيل',
      printLabel: 'طباعة الإيصال',
      // Toasts
      toastDelivered: 'تم التسليم والتحصيل',
      toastCancelled: 'تم الإلغاء',
      toastError: 'حدث خطأ',
    },

    // ── Server action errors ──────────────────────────────────────────────
    errors: {
      noCompany: 'هذه العملية تتم من داخل حساب المغسلة.',
      serviceNameRequired: 'اسم الصنف مطلوب.',
      serviceNotFound: 'الصنف غير موجود.',
      orderRequired: 'الطلب مطلوب.',
      invalidStatus: 'حالة غير صحيحة.',
      cannotCancelDelivered: 'لا يمكن إلغاء طلب مُسلّم.',
    },
  },
};

export const en = {
  laundry: {
    // ── Shared / no-company ───────────────────────────────────────────────
    noCompany: 'Laundry management is handled inside the laundry account.',

    // ── Dashboard ─────────────────────────────────────────────────────────
    dashboard: {
      title: 'Laundry Dashboard',
      description: 'Quick overview of orders and revenue.',
      ordersLink: 'Orders',
      gsServices: 'Define garments & prices',
      gsFirstOrder: 'Create your first order',
      statSalesToday: "Today's Sales",
      statReceived: 'Received',
      statWashing: 'Washing',
      statReady: 'Ready for Delivery',
    },

    // ── Services (price list) ─────────────────────────────────────────────
    services: {
      title: 'Garments & Prices',
      description: 'Price list for garments (shirt, trousers, suit, regular wash…).',
      entityLabel: 'Garment',
      namePlaceholder: 'Shirt / Trousers / Suit',
    },

    // ── Orders list ───────────────────────────────────────────────────────
    orders: {
      title: 'Laundry Orders',
      titleShort: 'Orders',
      description: 'Receive, wash, ready, then deliver & collect.',
      newButton: 'New Order',
      openOrderButton: 'Open Order',
      cancelButton: 'Cancel',
      empty: 'No orders found.',
      failedToOpen: 'Failed to open order',
      // New order form
      labelCustomerName: 'Customer Name',
      placeholderCustomerName: 'Customer Name',
      labelPhone: 'Phone',
      labelDelivery: 'Home Delivery',
      // Order card
      fallbackCustomer: 'Customer',
      itemCount: '{count} item(s)',
      dueDate: 'Due {date}',
    },

    // ── Order status labels ───────────────────────────────────────────────
    status: {
      received: 'Received',
      washing: 'Washing',
      ready: 'Ready',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
    },

    // ── Status filter tabs ────────────────────────────────────────────────
    filter: {
      all: 'All',
      received: 'Received',
      washing: 'Washing',
      ready: 'Ready',
    },

    // ── Order editor ──────────────────────────────────────────────────────
    editor: {
      backLink: 'Orders',
      fallbackTitle: 'Laundry Order',
      // Workflow buttons / messages
      startWashing: 'Start Washing',
      toastWashingStarted: 'Washing started',
      markReady: 'Mark Ready',
      toastReady: 'Order is ready',
      orderReadyHint: 'Order is ready — deliver and collect below.',
      // Closed / no-services states
      closedOrder: 'This order is {state} — view only.',
      closedStateCancelled: 'cancelled',
      closedStateDelivered: 'delivered',
      noServices: 'No garments defined. Add them from the Garments & Prices page.',
      // Meta form
      labelCustomerName: 'Customer Name',
      labelPhone: 'Phone',
      labelAddress: 'Address',
      labelDueDate: 'Due Date',
      labelDelivery: 'Delivery',
      labelDeliveryFee: 'Delivery Fee',
      labelDiscount: 'Discount',
      saveButton: 'Save',
      closeButton: 'Close',
      toastSaved: 'Saved',
      // Items list
      noItemsYet: 'No items yet — pick from the list.',
      // Totals
      subtotal: 'Subtotal',
      discount: 'Discount',
      deliveryFee: 'Delivery Fee',
      total: 'Total',
      adjustLink: 'Customer / Delivery / Discount / Due Date',
      // Checkout footer props
      checkoutLabel: 'Deliver & Collect',
      printLabel: 'Print Receipt',
      // Toasts
      toastDelivered: 'Delivered and collected',
      toastCancelled: 'Order cancelled',
      toastError: 'An error occurred',
    },

    // ── Server action errors ──────────────────────────────────────────────
    errors: {
      noCompany: 'This operation must be performed inside the laundry account.',
      serviceNameRequired: 'Garment name is required.',
      serviceNotFound: 'Garment not found.',
      orderRequired: 'Order ID is required.',
      invalidStatus: 'Invalid status.',
      cannotCancelDelivered: 'Cannot cancel a delivered order.',
    },
  },
};
