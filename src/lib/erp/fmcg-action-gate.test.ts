import { describe, it, expect } from 'vitest';
import { gateFmcgAction, FMCG_ACTION_PERMS, type FmcgAction } from './fmcg-action-gate';
import { ALL_PERMISSIONS, type PermissionContext } from './permissions';

const noPerms: PermissionContext = { isSuperAdmin: false, permissions: [] };
const superAdmin: PermissionContext = { isSuperAdmin: true, permissions: [] };
const actions = Object.keys(FMCG_ACTION_PERMS) as FmcgAction[];

describe('gateFmcgAction · unauthenticated', () => {
  it('returns ok:false / unauthenticated when there is no context', () => {
    for (const a of actions) {
      expect(gateFmcgAction(null, a)).toEqual({ ok: false, error: 'unauthenticated' });
    }
  });
});

describe('gateFmcgAction · missing permission', () => {
  it('returns ok:false / unauthorized for a user holding none of the perms', () => {
    for (const a of actions) {
      expect(gateFmcgAction(noPerms, a)).toEqual({ ok: false, error: 'unauthorized' });
    }
  });
});

describe('gateFmcgAction · granted', () => {
  it('allows a user holding the exact required permission', () => {
    for (const a of actions) {
      const ctx: PermissionContext = { isSuperAdmin: false, permissions: [FMCG_ACTION_PERMS[a][0]] };
      expect(gateFmcgAction(ctx, a)).toEqual({ ok: true });
    }
  });

  it('super admin may run every action', () => {
    for (const a of actions) {
      expect(gateFmcgAction(superAdmin, a)).toEqual({ ok: true });
    }
  });
});

describe('FMCG_ACTION_PERMS · integrity', () => {
  it('every action lists at least one known permission', () => {
    for (const a of actions) {
      expect(FMCG_ACTION_PERMS[a].length).toBeGreaterThan(0);
      for (const p of FMCG_ACTION_PERMS[a]) {
        expect(ALL_PERMISSIONS).toContain(p);
      }
    }
  });
});
