/** Data Integration Layer messages (placeholder/overview). ar/en keys identical. */
export const ar = {
  integrations: {
    title: 'استيراد البيانات والتكاملات',
    description: 'استورد بياناتك من Excel/CSV واربط VANTORA بالأنظمة الأخرى. (قيد التطوير)',
    soon: 'قريباً',
    note: 'هذه الميزة قيد التطوير ضمن خطة المنصّة — راجع docs/INTEGRATION.md.',
    areas: {
      dataImport: { t: 'استيراد البيانات', d: 'رفع ملفات Excel/CSV واستيرادها إلى الوحدات (عملاء، منتجات، موردين…).' },
      mappingTemplates: { t: 'قوالب الربط', d: 'احفظ ربط أعمدة الملف بحقول النظام لإعادة الاستخدام بسهولة.' },
      connections: { t: 'التكاملات', d: 'اربط VANTORA بأنظمة خارجية (ERP/محاسبة/BI) — وارد وصادر.' },
      apiKeys: { t: 'مفاتيح API', d: 'مفاتيح خاصة بكل شركة للوصول الآمن عبر الـREST API.' },
      webhooks: { t: 'Webhooks', d: 'إشعارات صادرة عند الأحداث (عميل/فاتورة/دفعة/مخزون).' },
      syncLogs: { t: 'سجلّات المزامنة', d: 'سجل كامل لكل استيراد/تصدير/مزامنة مع الأخطاء وإعادة المحاولة.' },
    },
  },
};

export const en = {
  integrations: {
    title: 'Data Import & Integrations',
    description: 'Import your data from Excel/CSV and connect VANTORA to other systems. (In development)',
    soon: 'Soon',
    note: 'This capability is on the platform roadmap — see docs/INTEGRATION.md.',
    areas: {
      dataImport: { t: 'Data Import', d: 'Upload Excel/CSV and import into modules (customers, products, suppliers…).' },
      mappingTemplates: { t: 'Mapping Templates', d: 'Save column→field mappings to repeat imports easily.' },
      connections: { t: 'Integrations', d: 'Connect VANTORA to external systems (ERP/accounting/BI) — inbound & outbound.' },
      apiKeys: { t: 'API Keys', d: 'Per-company keys for secure access via the REST API.' },
      webhooks: { t: 'Webhooks', d: 'Outbound notifications on events (customer/invoice/payment/inventory).' },
      syncLogs: { t: 'Sync Logs', d: 'A full record of every import/export/sync with errors and retries.' },
    },
  },
};
