import { describe, it, expect } from 'vitest';
import { sensitiveChanges, SENSITIVE_FIELDS } from './customer-approval';

const base = {
  cr_number: 'CR-1', tax_number: 'VAT-1', credit_limit: 5000, channel_id: 'ch1',
  segment_id: 'seg1', classification_id: 'cls1', payment_terms_days: 30,
  // minor fields the differ logic must ignore:
  phone: '111', contact_person: 'A', name_ar: 'x',
};

describe('customer approval — sensitive change detection', () => {
  it('returns no changes when sensitive fields are unchanged (minor edits ignored)', () => {
    const next = { ...base, phone: '999', contact_person: 'B', name_ar: 'y' };
    expect(sensitiveChanges(next, base)).toEqual({});
  });

  it('flags a sensitive text change (only that field)', () => {
    const next = { ...base, cr_number: 'CR-2', phone: '999' };
    expect(sensitiveChanges(next, base)).toEqual({ cr_number: 'CR-2' });
  });

  it('flags sensitive FK + numeric changes', () => {
    const next = { ...base, segment_id: 'seg2', credit_limit: 8000 };
    expect(sensitiveChanges(next, base)).toEqual({ segment_id: 'seg2', credit_limit: 8000 });
  });

  it('treats numeric equality irrespective of string form (5000 vs "5000.00")', () => {
    const next = { ...base, credit_limit: 5000 };
    const current = { ...base, credit_limit: '5000.00' as unknown as number };
    expect(sensitiveChanges(next, current)).toEqual({});
  });

  it('the sensitive set matches the locked decision', () => {
    expect([...SENSITIVE_FIELDS].sort()).toEqual(
      ['channel_id', 'classification_id', 'cr_number', 'credit_limit', 'payment_terms_days', 'segment_id', 'tax_number'].sort(),
    );
  });
});
