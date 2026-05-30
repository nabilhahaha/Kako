/** market module messages. Keep ar/en keys identical. */
export const ar = {
  market: {
    // ── No-company guard ──────────────────────────────────────────────────
    noCompany: 'يتم البيع من داخل حساب المتجر.',

    // ── POS page ──────────────────────────────────────────────────────────
    pos: {
      title: 'الكاشير',
      description: 'بيع سريع بالباركود — نقدي/فيزا مع حساب الباقي.',
      searchPlaceholder: 'امسح الباركود أو ابحث بالاسم/الكود ثم Enter…',
      // Cart
      cartTitle: 'السلة',
      cartEmpty: 'السلة فارغة — امسح صنفاً.',
      total: 'الإجمالي',
      // Payment
      paymentCash: 'كاش',
      paymentCard: 'فيزا',
      placeholderPaid: 'المدفوع',
      changeLabel: 'الباقي',
      checkoutBtn: 'إنهاء البيع وطباعة',
      // Toasts / errors
      errorSelectBranch: 'اختر الفرع',
      errorCheckout: 'تعذّر إتمام البيع',
      toastSaleComplete: 'تم البيع',
      toastSaleWithChange: 'تم البيع — الباقي {change} ج.م',
    },

    // ── Server action errors ──────────────────────────────────────────────
    errors: {
      noCompany: 'هذه العملية تتم من داخل حساب المتجر.',
      branchRequired: 'الفرع مطلوب.',
      noItems: 'أضف صنفاً واحداً على الأقل.',
      cashCustomerFailed: 'تعذّر تجهيز العميل النقدي.',
      saleFailed: 'تعذّر إتمام البيع: {detail}',
      paymentFailed: 'تم البيع لكن تعذّر تسجيل الدفع: {detail}',
    },
  },
};

export const en = {
  market: {
    // ── No-company guard ──────────────────────────────────────────────────
    noCompany: 'Sales are processed inside the store account.',

    // ── POS page ──────────────────────────────────────────────────────────
    pos: {
      title: 'Cashier',
      description: 'Fast barcode POS — cash or card with change calculation.',
      searchPlaceholder: 'Scan barcode or search by name/code then Enter…',
      // Cart
      cartTitle: 'Cart',
      cartEmpty: 'Cart is empty — scan an item.',
      total: 'Total',
      // Payment
      paymentCash: 'Cash',
      paymentCard: 'Card',
      placeholderPaid: 'Amount paid',
      changeLabel: 'Change',
      checkoutBtn: 'Complete Sale & Print',
      // Toasts / errors
      errorSelectBranch: 'Please select a branch',
      errorCheckout: 'Could not complete sale',
      toastSaleComplete: 'Sale complete',
      toastSaleWithChange: 'Sale complete — change {change} EGP',
    },

    // ── Server action errors ──────────────────────────────────────────────
    errors: {
      noCompany: 'This action must be performed inside the store account.',
      branchRequired: 'Branch is required.',
      noItems: 'Add at least one item.',
      cashCustomerFailed: 'Could not set up the cash customer.',
      saleFailed: 'Could not complete sale: {detail}',
      paymentFailed: 'Sale completed but payment recording failed: {detail}',
    },
  },
};
