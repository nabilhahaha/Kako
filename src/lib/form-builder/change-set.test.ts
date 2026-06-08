import { describe, it, expect } from 'vitest';
import { extractChangeSet, hasChanges, customerDataUpdateForm } from './index';

describe('form-builder/change-set', () => {
  const def = customerDataUpdateForm();

  it('projects answers to governed entity columns, dropping form-meta + empties', () => {
    const changes = extractChangeSet(def, {
      phone: '0551112222',
      classification_id: 'uuid-a',
      tax_number: '',                 // empty → excluded
      reason: 'reclassification',     // form-meta (no governanceKey) → excluded
      reason_detail: 'x',             // form-meta → excluded
      documents: 'file.pdf',          // attachment (no governanceKey) → excluded
    });
    expect(changes).toEqual({ phone: '0551112222', classification_id: 'uuid-a' });
  });

  it('hasChanges is false when only meta/empties are present', () => {
    expect(hasChanges(def, { reason: 'other', reason_detail: 'note' })).toBe(false);
    expect(hasChanges(def, { route_id: 'r1' })).toBe(true);
  });
});
