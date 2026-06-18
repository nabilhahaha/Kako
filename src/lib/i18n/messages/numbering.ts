/** Document Numbering messages. Business-friendly per the Back Office UX
 *  standard — no "sequence", "current_val" or table names. Keep ar/en key sets
 *  identical. */
export const ar = {
  numbering: {
    pageTitle: 'ترقيم المستندات',
    pageDescription: 'حدّد بادئة كل نوع مستند ورقم المستند التالي. لا يتأثر أي مستند صدر سابقاً.',
    adminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',

    branch: 'الفرع',
    prefix: 'البادئة',
    nextNumber: 'الرقم التالي',
    preview: 'معاينة',
    notStarted: 'لم يبدأ بعد',
    save: 'حفظ',
    minHint: 'لا يمكن أن يقل الرقم التالي عن {n} حتى لا يتكرر رقم مستند صدر من قبل.',

    docType: {
      invoice: 'الفواتير',
      sales_order: 'أوامر البيع',
      purchase_order: 'أوامر الشراء',
      journal: 'القيود اليومية',
      transfer: 'التحويلات المخزنية',
      goods_receipt: 'إذون الاستلام',
      return: 'المرتجعات',
      payment_voucher: 'سندات الصرف',
      receipt_voucher: 'سندات القبض',
      collection: 'التحصيلات',
    },

    noBranchesTitle: 'لا توجد فروع بعد',
    noBranchesDescription: 'أضف فرعاً أولاً ثم عُد لضبط ترقيم المستندات.',

    toast: { saved: 'تم حفظ الترقيم' },
    err: {
      generic: 'حدث خطأ',
      number_too_low: 'الرقم التالي أقل من اللازم — قد يكرر رقم مستند صدر سابقاً.',
      unknown_type: 'نوع مستند غير معروف.',
      unauthorized: 'غير مصرّح.',
    },
  },
};

export const en = {
  numbering: {
    pageTitle: 'Document Numbering',
    pageDescription: 'Set the prefix and the next number for each document type. Already-issued documents are never affected.',
    adminOnly: 'This page is available to the company admin only.',

    branch: 'Branch',
    prefix: 'Prefix',
    nextNumber: 'Next number',
    preview: 'Preview',
    notStarted: 'Not started yet',
    save: 'Save',
    minHint: 'The next number can’t be lower than {n}, so an already-issued document number is never reused.',

    docType: {
      invoice: 'Invoices',
      sales_order: 'Sales Orders',
      purchase_order: 'Purchase Orders',
      journal: 'Journal Entries',
      transfer: 'Stock Transfers',
      goods_receipt: 'Goods Receipts',
      return: 'Returns',
      payment_voucher: 'Payment Vouchers',
      receipt_voucher: 'Receipt Vouchers',
      collection: 'Collections',
    },

    noBranchesTitle: 'No branches yet',
    noBranchesDescription: 'Add a branch first, then come back to set up document numbering.',

    toast: { saved: 'Numbering saved' },
    err: {
      generic: 'Something went wrong',
      number_too_low: 'The next number is too low — it could reuse an already-issued document number.',
      unknown_type: 'Unknown document type.',
      unauthorized: 'Unauthorized.',
    },
  },
};
