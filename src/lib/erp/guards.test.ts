import { describe, it, expect, vi, beforeEach } from 'vitest';
import { friendlyDbError, requireActionPermission, ACTION_NOT_AUTHORIZED } from './guards';
import { getUserContext } from './auth-context';
import type { UserContext } from './auth-context';

vi.mock('./auth-context', () => ({ getUserContext: vi.fn() }));
const mockedGetCtx = vi.mocked(getUserContext);

function ctx(partial: Partial<UserContext>): UserContext {
  return {
    userId: 'u1', companyId: 'c1', permissions: [],
    isSuperAdmin: false, isPlatformOwner: false, modules: [],
    ...partial,
  } as UserContext;
}

describe('requireActionPermission (always-on money-path gate)', () => {
  beforeEach(() => mockedGetCtx.mockReset());

  it('rejects an unauthenticated request', async () => {
    mockedGetCtx.mockResolvedValue(null);
    const r = await requireActionPermission('field.sales');
    expect(r.ctx).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('allows a user that holds the permission', async () => {
    mockedGetCtx.mockResolvedValue(ctx({ permissions: ['field.sales'] }));
    const r = await requireActionPermission('field.sales');
    expect(r.error).toBeNull();
    expect(r.ctx?.userId).toBe('u1');
  });

  it('rejects a user lacking the permission — independent of any feature flag', async () => {
    mockedGetCtx.mockResolvedValue(ctx({ permissions: ['inventory.view'] }));
    const r = await requireActionPermission('sales.collect');
    expect(r.ctx).toBeNull();
    expect(r.error).toBe(ACTION_NOT_AUTHORIZED);
  });

  it('grants super-admins and platform owners', async () => {
    mockedGetCtx.mockResolvedValue(ctx({ isSuperAdmin: true }));
    expect((await requireActionPermission('field.sales')).error).toBeNull();
    mockedGetCtx.mockResolvedValue(ctx({ isPlatformOwner: true }));
    expect((await requireActionPermission('sales.collect')).error).toBeNull();
  });
});

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
