/** Workflow Builder (8A) — reusable approval-template catalog. ar/en. */
const category = (vals: Record<string, string>) => vals;

export const ar = {
  workflowBuilder: {
    templatesTitle: 'قوالب سير العمل',
    templatesDescription: 'ابدأ من قالب اعتماد جاهز — يُنسخ إلى مسودة سير عمل خاصة بشركتك.',
    noTemplates: 'لا توجد قوالب متاحة.',
    useTemplate: 'استخدام القالب',
    useOk: 'تم إنشاء مسودة سير العمل من القالب.',
    useError: 'تعذّر استخدام القالب.',
    category: category({
      customer: 'العملاء', price: 'الأسعار', trade_spend: 'الإنفاق التجاري', return: 'المرتجعات',
      collection: 'التحصيل', purchase: 'المشتريات', credit: 'الائتمان', data_update: 'تحديث البيانات',
      expiry: 'الصلاحية', custom: 'مخصص',
    }),
  },
};

export const en = {
  workflowBuilder: {
    templatesTitle: 'Workflow Templates',
    templatesDescription: 'Start from a ready approval template — it clones into a draft workflow owned by your company.',
    noTemplates: 'No templates available.',
    useTemplate: 'Use template',
    useOk: 'Draft workflow created from the template.',
    useError: 'Could not use the template.',
    category: category({
      customer: 'Customer', price: 'Price', trade_spend: 'Trade Spend', return: 'Returns',
      collection: 'Collection', purchase: 'Purchase', credit: 'Credit', data_update: 'Data Update',
      expiry: 'Expiry', custom: 'Custom',
    }),
  },
};
