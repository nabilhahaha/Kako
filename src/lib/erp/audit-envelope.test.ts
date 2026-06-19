import { describe, it, expect } from 'vitest';
import { auditEnvelope, diffFields } from './audit-envelope';

describe('auditEnvelope', () => {
  it('includes structured keys and omits empty ones', () => {
    const d = auditEnvelope({ field: 'cr_number', oldValue: 'A', newValue: 'B', role: 'admin', reason: 'fix', requestRef: 'req-1' });
    expect(d).toEqual({ field: 'cr_number', oldValue: 'A', newValue: 'B', role: 'admin', reason: 'fix', requestRef: 'req-1' });
  });

  it('omits null/empty role, reason, requestRef', () => {
    const d = auditEnvelope({ field: 'x', oldValue: 1, newValue: 2, role: null, reason: '', requestRef: null });
    expect(d).toEqual({ field: 'x', oldValue: 1, newValue: 2 });
  });

  it('merges legacy extra keys underneath the structured ones', () => {
    const d = auditEnvelope({ field: 'credit_limit', oldValue: 100, newValue: 200, extra: { old_limit: 100, new_limit: 200 } });
    expect(d).toMatchObject({ field: 'credit_limit', oldValue: 100, newValue: 200, old_limit: 100, new_limit: 200 });
  });

  it('carries a multi-field changes array', () => {
    const d = auditEnvelope({ changes: [{ field: 'phone', oldValue: '1', newValue: '2' }], role: 'supervisor' });
    expect(d.changes).toEqual([{ field: 'phone', oldValue: '1', newValue: '2' }]);
    expect(d.role).toBe('supervisor');
  });
});

describe('diffFields', () => {
  it('emits only changed keys, null-normalised', () => {
    const before = { a: 1, b: 'x', c: null };
    const after = { a: 2, b: 'x', c: undefined };
    expect(diffFields(before, after, ['a', 'b', 'c'])).toEqual([{ field: 'a', oldValue: 1, newValue: 2 }]);
  });

  it('treats null and undefined as equal (no spurious change)', () => {
    expect(diffFields({ x: null }, { x: undefined }, ['x'])).toEqual([]);
  });
});
