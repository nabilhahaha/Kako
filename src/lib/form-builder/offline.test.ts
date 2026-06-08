import { describe, it, expect } from 'vitest';
import { APPLY_WHITELIST, isApplicable } from '@/lib/offline-sync';

// 8F-2 registers a create-only, immutable form_response entity on the offline
// whitelist. Updates/deletes must never be auto-applied (responses are immutable).
describe('form-builder/offline · whitelist', () => {
  it('form_response is create-only', () => {
    expect(APPLY_WHITELIST.form_response).toEqual(['create']);
    expect(isApplicable('form_response', 'create')).toBe(true);
    expect(isApplicable('form_response', 'update')).toBe(false);
    expect(isApplicable('form_response', 'delete')).toBe(false);
  });
});
