/** Van operations — collection receipt, stock visibility, return slip. ar =
 *  source of truth; en mirrors EXACTLY (i18n parity test enforces keys). */
export const ar = {
  vanops: {
    // Collection receipt
    receiptTitle: 'سند قبض',
    receivedFrom: 'استلمنا من',
    method: 'طريقة الدفع',
    againstInvoice: 'عن فاتورة',
    receiptThanks: 'شكراً لتعاملكم معنا.',
    // Stock visibility
    stockTitle: 'المخزون',
    stockSubtitle: 'المتاح وحالة المخزون — الأكثر خطورة أولاً.',
    inStock: 'متوفر',
    lowStock: 'منخفض',
    outOfStock: 'نفد',
    noStock: 'لا توجد بيانات مخزون متاحة.',
    expiryNote: 'تنبيه الصلاحية غير متاح بعد (لا يوجد حقل تاريخ صلاحية في المخزون) — موثّق في خطة العمل.',
    // Return slip
    returnTitle: 'مرتجع مبيعات',
    reason: 'السبب',
  },
};

export const en = {
  vanops: {
    receiptTitle: 'Payment Receipt',
    receivedFrom: 'Received from',
    method: 'Method',
    againstInvoice: 'Against invoice',
    receiptThanks: 'Thank you for your business.',
    stockTitle: 'Stock',
    stockSubtitle: 'Availability and stock status — most at-risk first.',
    inStock: 'In stock',
    lowStock: 'Low',
    outOfStock: 'Out',
    noStock: 'No stock data available.',
    expiryNote: 'Near-expiry is not available yet (no expiry field on stock) — documented in the sprint plan.',
    returnTitle: 'Sales Return',
    reason: 'Reason',
  },
};
