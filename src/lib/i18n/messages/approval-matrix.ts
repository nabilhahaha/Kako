/** Approval Matrix builder messages. Business-friendly per the Back Office UX
 *  standard — "who approves what", no workflow/engine jargon. Keep ar/en key
 *  sets identical. */
export const ar = {
  approvalMatrix: {
    pageTitle: 'الموافقات',
    pageDescription: 'حدّد من يعتمد كل إجراء، وأضف مستويات اعتماد حسب المبلغ عند الحاجة.',
    adminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',
    cumulativeNote: 'كل مستوى أعلى يضيف معتمِداً إضافياً فوق المستويات الأقل — وليس بدلاً منها.',
    previewTitle: 'من يعتمد:',
    previewAlways: 'دائماً: {who}',
    previewOver: 'فوق {amount}: أيضاً {who}',
    previewEvery: 'في كل مرة: {who}',

    byAmount: 'اعتماد متدرّج حسب المبلغ',
    everyTime: 'اعتماد في كل مرة',
    on: 'مُفعّل',
    approver: 'المعتمِد',
    companyAdmin: 'مدير الشركة',
    whenAbove: 'عندما يتجاوز المبلغ',
    addApprover: 'إضافة معتمِد',
    removeApprover: 'إزالة المعتمِد',
    save: 'حفظ وتفعيل',
    turnOff: 'إيقاف',

    scenario: {
      credit_limit_approval_v2: 'تغيير حد الائتمان',
      price_change_approval: 'استثناء السعر',
      trade_spend_approval: 'الإنفاق التجاري / العروض',
      customer_data_update: 'تعديل بيانات العميل',
      stock_request_approval: 'طلب المخزون',
    },

    toast: { saved: 'تم حفظ مصفوفة الموافقات وتفعيلها', off: 'تم إيقاف الاعتماد' },
    err: {
      generic: 'حدث خطأ',
      empty: 'أضف معتمِداً واحداً على الأقل.',
      missing_approver: 'اختر معتمِداً لكل مستوى.',
      duplicate_threshold: 'لا يمكن تكرار نفس المبلغ في أكثر من مستوى.',
      bad_amount: 'مبلغ غير صالح.',
      unknown_scenario: 'إجراء غير معروف.',
      unauthorized: 'غير مصرّح.',
      publish_failed: 'تعذّر تفعيل الموافقات.',
    },
  },
};

export const en = {
  approvalMatrix: {
    pageTitle: 'Approvals',
    pageDescription: 'Decide who approves each action, with amount-based approval levels where needed.',
    adminOnly: 'This page is available to the company admin only.',
    cumulativeNote: 'Each higher level adds an approver on top of the lower ones — not instead of them.',
    previewTitle: 'Who approves:',
    previewAlways: 'Always: {who}',
    previewOver: 'Over {amount}: also {who}',
    previewEvery: 'Every time: {who}',

    byAmount: 'Stepped approval by amount',
    everyTime: 'Approval every time',
    on: 'On',
    approver: 'Approver',
    companyAdmin: 'Company admin',
    whenAbove: 'when amount is above',
    addApprover: 'Add approver',
    removeApprover: 'Remove approver',
    save: 'Save & activate',
    turnOff: 'Turn off',

    scenario: {
      credit_limit_approval_v2: 'Credit limit change',
      price_change_approval: 'Price exception',
      trade_spend_approval: 'Trade spend / promotions',
      customer_data_update: 'Customer data change',
      stock_request_approval: 'Stock request',
    },

    toast: { saved: 'Approval matrix saved & activated', off: 'Approval turned off' },
    err: {
      generic: 'Something went wrong',
      empty: 'Add at least one approver.',
      missing_approver: 'Choose an approver for every level.',
      duplicate_threshold: 'Two levels can’t use the same amount.',
      bad_amount: 'Invalid amount.',
      unknown_scenario: 'Unknown action.',
      unauthorized: 'Unauthorized.',
      publish_failed: 'Could not activate the approvals.',
    },
  },
};
