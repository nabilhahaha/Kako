import { describe, it, expect } from 'vitest';
import { friendlyDbError } from './guards';

describe('friendlyDbError', () => {
  it('maps unique-violation (23505)', () => {
    expect(friendlyDbError({ code: '23505', message: 'dup' })).toContain('مستخدم');
  });
  it('maps foreign-key violation (23503)', () => {
    expect(friendlyDbError({ code: '23503', message: 'fk' })).toContain('الحذف');
  });
  it('maps insufficient privilege (42501)', () => {
    expect(friendlyDbError({ code: '42501', message: 'denied' })).toContain('صلاحية');
  });
  it('falls back to the raw message for unknown codes', () => {
    expect(friendlyDbError({ message: 'something broke' })).toBe('something broke');
    expect(friendlyDbError({ code: '99999', message: 'other' })).toBe('other');
  });
});
