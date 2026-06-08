import { describe, it, expect } from 'vitest';
import {
  SEEDED_FORMS, seededForm, customerDataUpdateForm,
  validateFormDefinition, allFields,
} from './index';

describe('form-builder/forms · seeded catalog', () => {
  it('every seeded form definition is well-formed', () => {
    for (const f of SEEDED_FORMS) {
      expect(validateFormDefinition(f.definition)).toEqual([]);
    }
  });

  it('binds every entity-backed field to a customer governance key (key === column)', () => {
    const cdu = seededForm('customer_data_update');
    expect(cdu?.entity).toBe('customer');
    const govKeys = allFields(customerDataUpdateForm()).filter((f) => f.governanceKey).map((f) => f.governanceKey);
    expect(govKeys).toEqual([
      'cr_number', 'tax_number', 'national_address',
      'phone', 'contact_person', 'contact_phone',
      'classification_id', 'channel_id', 'segment_id', 'route_id',
      'latitude', 'longitude',
    ]);
    // key === governanceKey so the before/after snapshot reads the right columns.
    for (const f of allFields(customerDataUpdateForm())) {
      if (f.governanceKey) expect(f.key).toBe(f.governanceKey);
    }
  });

  it('FMCG master-data fields use dynamic per-tenant option sources (not static)', () => {
    const byKey = new Map(allFields(customerDataUpdateForm()).map((f) => [f.key, f]));
    expect(byKey.get('classification_id')!.optionsSource).toEqual({ lookup: 'classification' });
    expect(byKey.get('channel_id')!.optionsSource).toEqual({ lookup: 'channel' });
    expect(byKey.get('segment_id')!.optionsSource).toEqual({ lookup: 'segment' });
    expect(byKey.get('route_id')!.optionsSource).toEqual({ table: 'erp_routes' });
    expect(byKey.get('documents')!.type).toBe('file'); // supporting documents
  });

  it('has a conditional details field shown only for reason=other', () => {
    const detail = allFields(customerDataUpdateForm()).find((f) => f.key === 'reason_detail');
    expect(detail?.showWhen).toEqual({ field: 'reason', equals: 'other' });
  });
});
