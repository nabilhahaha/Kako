/** Billing & Subscriptions admin (Platform Owner). ar/en keys identical. */
export const ar = {
  billing: {
    title: 'الفوترة والاشتراكات',
    subtitle: 'إدارة الأسعار متعددة العملات والاشتراكات وسجل الفواتير.',
    ownerOnly: 'إدارة الفوترة متاحة لمالك المنصة فقط.',
    priceBook: {
      title: 'قائمة الأسعار (متعددة العملات)',
      hint: 'حدّد سعر كل خطة لكل عملة ولكل دورة (شهري/سنوي). المبالغ بالوحدة الرئيسية للعملة.',
      currency: 'العملة',
    },
    subscribe: {
      title: 'إسناد/تغيير اشتراك شركة',
      trialDays: 'أيام التجربة',
      submit: 'حفظ الاشتراك',
    },
    subscriptions: {
      title: 'الاشتراكات الحالية',
      empty: 'لا توجد اشتراكات بعد.',
      company: 'الشركة',
      plan: 'الخطة',
      status: 'الحالة',
      renews: 'التجديد/الانتهاء',
      actions: 'إجراءات',
      issueInvoice: 'إصدار فاتورة',
    },
    invoices: {
      title: 'سجل الفواتير',
      empty: 'لا توجد فواتير بعد.',
      number: 'رقم الفاتورة',
      company: 'الشركة',
      tax: 'الضريبة',
      total: 'الإجمالي',
      status: 'الحالة',
      date: 'التاريخ',
    },
    toast: {
      error: 'حدث خطأ',
      priceSaved: 'تم حفظ السعر',
      subscribed: 'تم حفظ الاشتراك',
      statusSet: 'تم تحديث الحالة',
      invoiceIssued: 'تم إصدار الفاتورة',
    },
  },
};

export const en = {
  billing: {
    title: 'Billing & Subscriptions',
    subtitle: 'Manage multi-currency pricing, subscriptions, and invoice history.',
    ownerOnly: 'Billing administration is restricted to the Platform Owner.',
    priceBook: {
      title: 'Price book (multi-currency)',
      hint: 'Set each plan price per currency and per interval (monthly/yearly). Amounts are in the currency’s major unit.',
      currency: 'Currency',
    },
    subscribe: {
      title: 'Assign / change a company subscription',
      trialDays: 'Trial days',
      submit: 'Save subscription',
    },
    subscriptions: {
      title: 'Current subscriptions',
      empty: 'No subscriptions yet.',
      company: 'Company',
      plan: 'Plan',
      status: 'Status',
      renews: 'Renews / ends',
      actions: 'Actions',
      issueInvoice: 'Issue invoice',
    },
    invoices: {
      title: 'Invoice history',
      empty: 'No invoices yet.',
      number: 'Invoice #',
      company: 'Company',
      tax: 'Tax',
      total: 'Total',
      status: 'Status',
      date: 'Date',
    },
    toast: {
      error: 'Something went wrong',
      priceSaved: 'Price saved',
      subscribed: 'Subscription saved',
      statusSet: 'Status updated',
      invoiceIssued: 'Invoice issued',
    },
  },
};
