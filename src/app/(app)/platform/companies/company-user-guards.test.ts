import { describe, it, expect } from 'vitest';
import { isCompanyMember } from './company-user-guards';

// Cross-company scoping guard for setCompanyUserActive. The action fetches membership rows
// filtered to ONE company; this guard decides whether the target user may be mutated. A
// user from another tenant (absent from the rows) must be rejected.
describe('isCompanyMember — cross-company scoping for setCompanyUserActive', () => {
  const rows = [{ user_id: 'u1' }, { user_id: 'u2' }];

  it('allows a user that belongs to the company', () => {
    expect(isCompanyMember(rows, 'u1')).toBe(true);
    expect(isCompanyMember(rows, 'u2')).toBe(true);
  });

  it('BLOCKS a user from another company (not in the scoped rows)', () => {
    expect(isCompanyMember(rows, 'foreign-user')).toBe(false);
  });

  it('BLOCKS when the company has no members (empty scope)', () => {
    expect(isCompanyMember([], 'u1')).toBe(false);
  });
});
