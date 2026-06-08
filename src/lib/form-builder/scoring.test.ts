import { describe, it, expect } from 'vitest';
import { scoreFormResponse, customerDataUpdateForm, type FormDefinition } from './index';

describe('form-builder/scoring', () => {
  it('scores yesno/rating fields (survey parity), 0..100', () => {
    const def: FormDefinition = { sections: [{ key: 's', title: 'S', fields: [
      { key: 'clean', label: 'Clean shelf?', type: 'yesno' },
      { key: 'stars', label: 'Display', type: 'rating', max: 5 },
    ] }] };
    expect(scoreFormResponse(def, { clean: true, stars: 5 })).toBe(100);
    expect(scoreFormResponse(def, { clean: false, stars: 0 })).toBe(0);
    expect(scoreFormResponse(def, { clean: true, stars: 0 })).toBe(50);
  });

  it('returns null for a pure data form (no scored fields)', () => {
    expect(scoreFormResponse(customerDataUpdateForm(), { reason: 'moved' })).toBeNull();
  });
});
