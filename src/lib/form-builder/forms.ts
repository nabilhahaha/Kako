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
    workflow: {
      changeRequestTable: 'erp_customer_change_requests',
      targetIdField: 'customer_id',
      changeEntity: 'customer_change_request',
      eventType: 'customer_change_request.submitted',
      reasonField: 'reason',
    },
    sections: [
      {
        key: 'identity',
        title: 'Legal identity',
        titleAr: 'الهوية النظامية',
        fields: [
          { key: 'cr_number', label: 'CR number', labelAr: 'السجل التجاري', type: 'text', governanceKey: 'cr_number' },
          { key: 'tax_number', label: 'VAT number', labelAr: 'الرقم الضريبي', type: 'text', governanceKey: 'tax_number' },
          { key: 'national_address', label: 'National address', labelAr: 'العنوان الوطني', type: 'text', governanceKey: 'national_address' },
        ],
      },
      {
        key: 'contact',
        title: 'Contact details',
        titleAr: 'بيانات التواصل',
        fields: [
          { key: 'phone', label: 'Phone', labelAr: 'الهاتف', type: 'text', governanceKey: 'phone' },
          { key: 'contact_person', label: 'Contact person', labelAr: 'مسؤول التواصل', type: 'text', governanceKey: 'contact_person' },
          { key: 'contact_phone', label: 'Contact phone', labelAr: 'هاتف التواصل', type: 'text', governanceKey: 'contact_phone' },
        ],
      },
      {
        key: 'classification',
        title: 'Classification & routing',
        titleAr: 'التصنيف والتوزيع',
        fields: [
          { key: 'classification_id', label: 'Classification', labelAr: 'التصنيف', type: 'select', governanceKey: 'classification_id', optionsSource: { lookup: 'classification' } },
          { key: 'channel_id', label: 'Channel', labelAr: 'القناة', type: 'select', governanceKey: 'channel_id', optionsSource: { lookup: 'channel' } },
          { key: 'segment_id', label: 'Segment', labelAr: 'الشريحة', type: 'select', governanceKey: 'segment_id', optionsSource: { lookup: 'segment' } },
          { key: 'route_id', label: 'Route', labelAr: 'خط السير', type: 'select', governanceKey: 'route_id', optionsSource: { table: 'erp_routes' } },
        ],
      },
      {
        key: 'location',
        title: 'GPS location',
        titleAr: 'الموقع الجغرافي',
        fields: [
          { key: 'latitude', label: 'Latitude', labelAr: 'خط العرض', type: 'number', governanceKey: 'latitude' },
          { key: 'longitude', label: 'Longitude', labelAr: 'خط الطول', type: 'number', governanceKey: 'longitude' },
        ],
      },
      {
        key: 'attachments',
        title: 'Supporting documents',
        titleAr: 'المستندات الداعمة',
        fields: [
          { key: 'documents', label: 'Attachment', labelAr: 'مرفق', type: 'file' },
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
              { value: 'reclassification', label: 'Re-classification / re-route', labelAr: 'إعادة تصنيف / توجيه' },
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
