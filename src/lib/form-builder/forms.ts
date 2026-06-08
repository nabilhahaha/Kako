// ============================================================================
// Form Builder — canonical seeded forms (Phase 8F-2). Pure, no I/O. The single
// source of truth for platform-seeded global form definitions, reused by the
// renderer and asserted against the DB seed (migration 0241) in the integration
// test. Fields bind to the bound entity's governed fields via `governanceKey`, so
// visibility/edit/required resolve through Dynamic Field Governance (no bypass).
// ============================================================================

import type { FormDefinition } from './model';

export interface SeededForm {
  code: string;
  entity: string;
  nameEn: string;
  nameAr: string;
  version: number;
  definition: FormDefinition;
}

/** Customer Data Update — the no-code intake form behind the `customer_data_update`
 *  workflow. A field rep / CS agent proposes contact-data changes for a customer;
 *  the response feeds the approval workflow (the approval step references this form
 *  by code). Contact fields bind to the customer entity's governed fields. */
export function customerDataUpdateForm(): FormDefinition {
  return {
    sections: [
      {
        key: 'contact',
        title: 'Contact details',
        titleAr: 'بيانات التواصل',
        fields: [
          { key: 'phone', label: 'Phone', labelAr: 'الهاتف', type: 'text', governanceKey: 'phone' },
          { key: 'email', label: 'Email', labelAr: 'البريد', type: 'text', governanceKey: 'email' },
          { key: 'contact_person', label: 'Contact person', labelAr: 'مسؤول التواصل', type: 'text', governanceKey: 'contact_person' },
          { key: 'contact_phone', label: 'Contact phone', labelAr: 'هاتف التواصل', type: 'text', governanceKey: 'contact_phone' },
          { key: 'national_address', label: 'National address', labelAr: 'العنوان الوطني', type: 'text', governanceKey: 'national_address' },
        ],
      },
      {
        key: 'request',
        title: 'Request',
        titleAr: 'الطلب',
        fields: [
          {
            key: 'reason',
            label: 'Reason for change',
            labelAr: 'سبب التغيير',
            type: 'select',
            required: true,
            options: [
              { value: 'moved', label: 'Customer moved', labelAr: 'انتقل العميل' },
              { value: 'correction', label: 'Data correction', labelAr: 'تصحيح بيانات' },
              { value: 'new_contact', label: 'New contact person', labelAr: 'مسؤول تواصل جديد' },
              { value: 'other', label: 'Other', labelAr: 'أخرى' },
            ],
          },
          {
            key: 'reason_detail',
            label: 'Details',
            labelAr: 'تفاصيل',
            type: 'text',
            required: true,
            showWhen: { field: 'reason', equals: 'other' },
          },
        ],
      },
    ],
  };
}

/** Platform-seeded global forms (company_id IS NULL). */
export const SEEDED_FORMS: SeededForm[] = [
  {
    code: 'customer_data_update',
    entity: 'customer',
    nameEn: 'Customer Data Update',
    nameAr: 'تحديث بيانات العميل',
    version: 1,
    definition: customerDataUpdateForm(),
  },
];

/** Look up a seeded form by code. Pure. */
export function seededForm(code: string): SeededForm | undefined {
  return SEEDED_FORMS.find((f) => f.code === code);
}
