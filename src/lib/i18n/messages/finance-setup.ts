/** Company Tax / VAT / Currency setup messages. Business-friendly per the Back
 *  Office UX standard. Top-level namespace `finance` (no conflict with the
 *  accounting module). Keep ar/en key sets identical. */
export const ar = {
  finance: {
    pageTitle: 'الضرائب والعملة',
    pageDescription: 'حدّد دولة الشركة وعملتها ورقمها الضريبي. تُطبَّق نسبة الضريبة القياسية للدولة تلقائياً.',
    adminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',

    country: 'الدولة',
    selectCountry: 'اختر الدولة…',
    currency: 'العملة',
    selectCurrency: 'اختر العملة…',
    taxNumber: 'الرقم الضريبي',
    taxNumberPlaceholder: 'مثال: 100200300',
    taxNumberHint: 'أرقام فقط. اتركه فارغاً إذا لم تُسجَّل الشركة ضريبياً بعد.',

    standardVat: 'ضريبة القيمة المضافة القياسية',
    vatValue: '{rate}%',
    vatUnknown: 'اختر الدولة لعرض النسبة',

    save: 'حفظ',
    toast: { saved: 'تم حفظ الإعدادات المالية' },
    err: {
      generic: 'حدث خطأ',
      unknown_country: 'دولة غير مدعومة.',
      unauthorized: 'غير مصرّح.',
    },
  },
};

export const en = {
  finance: {
    pageTitle: 'Tax & Currency',
    pageDescription: 'Set your company’s country, currency and tax number. The country’s standard VAT rate is applied automatically.',
    adminOnly: 'This page is available to the company admin only.',

    country: 'Country',
    selectCountry: 'Choose a country…',
    currency: 'Currency',
    selectCurrency: 'Choose a currency…',
    taxNumber: 'Tax number',
    taxNumberPlaceholder: 'e.g. 100200300',
    taxNumberHint: 'Digits only. Leave empty if the company isn’t tax-registered yet.',

    standardVat: 'Standard VAT',
    vatValue: '{rate}%',
    vatUnknown: 'Choose a country to see the rate',

    save: 'Save',
    toast: { saved: 'Finance settings saved' },
    err: {
      generic: 'Something went wrong',
      unknown_country: 'Unsupported country.',
      unauthorized: 'Unauthorized.',
    },
  },
};
