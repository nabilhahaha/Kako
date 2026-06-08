import { describe, it, expect } from 'vitest';
import {
  ROLE_VERSIONING_ENABLED,
  latestPublished, upgradeAvailable, versionStatus, type RoleTemplateVersion,
  deriveOverride, planUpgrade, type CompanyOverride, type TemplateSnapshot,
} from './index';

const versions: RoleTemplateVersion[] = [
  { roleKey: 'salesman', versionNo: 1, status: 'published', snapshot: { permissions: ['sales.sell', 'sales.collect'] } },
  { roleKey: 'salesman', versionNo: 2, status: 'published', snapshot: { permissions: ['sales.sell', 'sales.collect', 'sales.return'] } },
  { roleKey: 'salesman', versionNo: 3, status: 'draft', snapshot: { permissions: ['sales.sell', 'sales.collect', 'sales.return', 'sales.discount'] } },
];

describe('role-templates/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_ROLE_VERSIONING;
    delete process.env.KAKO_ROLE_VERSIONING;
    expect(ROLE_VERSIONING_ENABLED()).toBe(false);
    process.env.KAKO_ROLE_VERSIONING = '1';
    expect(ROLE_VERSIONING_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_ROLE_VERSIONING; else process.env.KAKO_ROLE_VERSIONING = prev;
  });
});

describe('RULE 5/7 — versioning + current/latest/upgrade-available', () => {
  it('latest published ignores drafts', () => {
    expect(latestPublished(versions, 'salesman')!.versionNo).toBe(2); // v3 is draft
  });
  it('upgrade availability', () => {
    expect(upgradeAvailable(1, 2)).toBe(true);
    expect(upgradeAvailable(2, 2)).toBe(false);
    expect(upgradeAvailable(null, 2)).toBe(true);
  });
  it('per-company version status (what Platform Owner sees)', () => {
    expect(versionStatus(versions, 'salesman', 1)).toEqual({ roleKey: 'salesman', currentVersion: 1, latestVersion: 2, upgradeAvailable: true });
    expect(versionStatus(versions, 'salesman', 2).upgradeAvailable).toBe(false);
  });
});

describe('RULE 8 — override preservation across upgrade', () => {
  const v1: TemplateSnapshot = { permissions: ['sales.sell', 'sales.collect'] };
  const v2: TemplateSnapshot = { permissions: ['sales.sell', 'sales.collect', 'sales.return'] };

  it('derives a company override (Company A added returns.approve, removed sales.collect)', () => {
    const companyA: TemplateSnapshot = { permissions: ['sales.sell', 'returns.approve'] };
    const ov = deriveOverride(v1, companyA);
    expect(ov.addedPermissions).toContain('returns.approve');
    expect(ov.removedPermissions).toContain('sales.collect');
  });

  it('upgrade preserves the company override (Can Approve Returns = YES survives)', () => {
    const override: CompanyOverride = { addedPermissions: ['returns.approve'], removedPermissions: ['sales.collect'] };
    const plan = planUpgrade(v1, v2, override);
    // new base adds sales.return; company keeps returns.approve and keeps sales.collect removed
    expect(plan.effective.permissions).toContain('returns.approve');   // preserved grant
    expect(plan.effective.permissions).toContain('sales.return');      // new base
    expect(plan.effective.permissions).not.toContain('sales.collect'); // preserved revoke
    expect(plan.addedByUpgrade).toEqual(['sales.return']);
  });

  it('scope + field overrides survive', () => {
    const override: CompanyOverride = { addedPermissions: [], removedPermissions: [], dataScope: 'area', fieldVisibility: { margin: 'hidden' } };
    const plan = planUpgrade({ permissions: [], dataScope: 'own' }, { permissions: [], dataScope: 'team' }, override);
    expect(plan.effective.dataScope).toBe('area');                     // company scope wins
    expect(plan.effective.fieldVisibility!.margin).toBe('hidden');
  });
});

describe('RULE 2 — company isolation (structural)', () => {
  it('two companies upgrade the same template independently', () => {
    const v1: TemplateSnapshot = { permissions: ['a', 'b'] };
    const v2: TemplateSnapshot = { permissions: ['a', 'b', 'c'] };
    const a = planUpgrade(v1, v2, { addedPermissions: ['x'], removedPermissions: [] });
    const b = planUpgrade(v1, v2, { addedPermissions: [], removedPermissions: ['b'] });
    expect(a.effective.permissions).toContain('x');
    expect(a.effective.permissions).toContain('b');     // A keeps b
    expect(b.effective.permissions).not.toContain('x'); // B unaffected by A's grant
    expect(b.effective.permissions).not.toContain('b'); // B's own revoke
  });
});
