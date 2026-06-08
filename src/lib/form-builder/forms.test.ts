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

  it('customer_data_update binds contact fields to customer governance keys', () => {
    const cdu = seededForm('customer_data_update');
    expect(cdu?.entity).toBe('customer');
    const govKeys = allFields(customerDataUpdateForm()).map((f) => f.governanceKey).filter(Boolean);
    expect(govKeys).toEqual(['phone', 'email', 'contact_person', 'contact_phone', 'national_address']);
  });

  it('has a conditional details field shown only for reason=other', () => {
    const detail = allFields(customerDataUpdateForm()).find((f) => f.key === 'reason_detail');
    expect(detail?.showWhen).toEqual({ field: 'reason', equals: 'other' });
  });
});
