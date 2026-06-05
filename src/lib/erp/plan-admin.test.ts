import { describe, it, expect } from 'vitest';
import {
  validatePlanKey, validatePlan, withDependencies, orphanedDependencies,
  planModuleImpact, archiveWarning, normalizeRanks, isPlanGateable,
  type PlanInput, type CompanyModuleState,
} from './plan-admin';
import type { Module } from './navigation';

const basePlan: PlanInput = {
  key: 'growth', nameEn: 'Growth', nameAr: 'النمو', rank: 1,
  maxUsers: 25, maxBranches: 5, maxProducts: 5000, storageLimitMb: 1024,
  trialDays: 14, isActive: true,
};

describe('plan key validation', () => {
  it('accepts a clean slug', () => {
    expect(validatePlanKey('growth', ['free', 'pro']).ok).toBe(true);
  });
  it('rejects bad format and duplicates', () => {
    expect(validatePlanKey('Growth', []).errors).toContain('key_format');
    expect(validatePlanKey('1plan', []).errors).toContain('key_format');
    expect(validatePlanKey('a', []).errors).toContain('key_format'); // too short
    expect(validatePlanKey('pro', ['pro']).errors).toContain('key_taken');
  });
});

describe('plan validation', () => {
  it('passes a well-formed plan', () => {
    expect(validatePlan(basePlan, ['free']).ok).toBe(true);
  });
  it('flags missing names and negative/non-integer limits', () => {
    expect(validatePlan({ ...basePlan, nameEn: '' }).errors).toContain('name_required');
    expect(validatePlan({ ...basePlan, maxUsers: -1 }).errors).toContain('max_users_invalid');
    expect(validatePlan({ ...basePlan, storageLimitMb: 1.5 }).errors).toContain('storage_invalid');
    expect(validatePlan({ ...basePlan, trialDays: -3 }).errors).toContain('trial_invalid');
  });
  it('allows null (unlimited) limits', () => {
    expect(validatePlan({ ...basePlan, maxUsers: null, maxBranches: null, maxProducts: null, storageLimitMb: null }).ok).toBe(true);
  });
});

describe('module dependencies (advisory)', () => {
  it('only plan-gateable modules are accepted', () => {
    expect(isPlanGateable('sales')).toBe(true);
    expect(isPlanGateable('returns')).toBe(false); // not in ALL_MODULES → not plan-gated
  });
  it('withDependencies pulls in advisory deps (pos ⇒ sales+inventory)', () => {
    const out = withDependencies(['pos']);
    expect(out).toContain('sales');
    expect(out).toContain('inventory');
    expect(out).toContain('pos');
  });
  it('orphanedDependencies flags a module whose deps are missing', () => {
    const orphans = orphanedDependencies(['pos']);
    expect(orphans).toEqual([{ module: 'pos', missing: ['sales', 'inventory'] }]);
    expect(orphanedDependencies(['pos', 'sales', 'inventory'])).toEqual([]);
  });
});

describe('planModuleImpact — the impact preview', () => {
  const companies: CompanyModuleState[] = [
    { id: 'a', name: 'Acme', enabledModules: ['sales', 'inventory', 'fashion'] as Module[] },
    { id: 'b', name: 'Beta', enabledModules: ['sales', 'accounting'] as Module[] },
    { id: 'c', name: 'Gamma', enabledModules: ['sales'] as Module[] },
  ];

  it('reports added/removed modules', () => {
    const imp = planModuleImpact(['sales', 'inventory'], ['sales', 'accounting'], companies);
    expect(imp.added).toEqual(['accounting']);
    expect(imp.removed).toEqual(['inventory']);
  });

  it('only counts companies that actually use a changed module', () => {
    // remove inventory: only Acme has it enabled → 1 affected (loses inventory)
    const imp = planModuleImpact(['sales', 'inventory'], ['sales'], companies);
    expect(imp.removed).toEqual(['inventory']);
    expect(imp.affectedCount).toBe(1);
    expect(imp.affected[0]).toEqual({ id: 'a', name: 'Acme', gained: [], lost: ['inventory'] });
  });

  it('reports per-company gains when adding a module they have enabled', () => {
    // add accounting: only Beta has accounting enabled → Beta gains it effectively
    const imp = planModuleImpact(['sales'], ['sales', 'accounting'], companies);
    expect(imp.affected).toEqual([{ id: 'b', name: 'Beta', gained: ['accounting'], lost: [] }]);
  });

  it('a no-op change (module nobody uses) affects nobody', () => {
    const imp = planModuleImpact(['sales'], ['sales', 'hotel'], companies);
    expect(imp.added).toEqual(['hotel']);
    expect(imp.affectedCount).toBe(0);
    expect(imp.totalOnPlan).toBe(3);
  });
});

describe('archive guard & rank normalization', () => {
  it('warns when archiving a plan that still has companies', () => {
    expect(archiveWarning(5)).toBe('companies_still_assigned');
    expect(archiveWarning(0)).toBeNull();
  });
  it('normalizes ranks to a contiguous 0..n sequence', () => {
    expect(normalizeRanks(['free', 'standard', 'pro'])).toEqual({ free: 0, standard: 1, pro: 2 });
  });
});
