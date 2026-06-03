import { describe, it, expect } from 'vitest';
import {
  analyzeAction, explainScreen, suggestedQuestions, explainPermission, trainingGuide,
  type CopilotContext,
} from './copilot-engine';

const ctx = (over: Partial<CopilotContext> = {}): CopilotContext => ({
  permissions: [], modules: ['sales', 'inventory', 'accounting', 'field_ops', 'distribution'],
  roles: ['salesman'], topRole: 'salesman', isSuperAdmin: false, isPlatformOwner: false, companyActive: true, ...over,
});

describe('copilot · analyzeAction (why blocked)', () => {
  it('permission_missing when the user lacks the required permission', () => {
    const r = analyzeAction('customer.create', ctx({ permissions: [] }));
    expect(r.allowed).toBe(false);
    expect(r.reasons.map((x) => x.code)).toContain('permission_missing');
  });
  it('allowed when the user holds one of the any-permissions', () => {
    const r = analyzeAction('customer.create', ctx({ permissions: ['customers.manage'] }));
    expect(r.allowed).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });
  it('module_not_enabled when the module is off', () => {
    const r = analyzeAction('product.create', ctx({ permissions: ['inventory.view'], modules: ['sales'] }));
    expect(r.reasons.map((x) => x.code)).toContain('module_not_enabled');
  });
  it('scope_restricted only flagged for scoped roles', () => {
    const scoped = analyzeAction('customer.transfer', ctx({ permissions: ['customer.transfer'], topRole: 'salesman' }));
    expect(scoped.reasons.map((x) => x.code)).toContain('scope_restricted');
    const wide = analyzeAction('customer.transfer', ctx({ permissions: ['customer.transfer'], topRole: 'admin' }));
    expect(wide.reasons.map((x) => x.code)).not.toContain('scope_restricted');
  });
  it('super admin / platform owner bypass permission + module blocks', () => {
    expect(analyzeAction('accounting.post', ctx({ isSuperAdmin: true, modules: [] })).allowed).toBe(true);
  });
  it('subscription_inactive when company is not active', () => {
    const r = analyzeAction('day.close', ctx({ permissions: ['day.close'], companyActive: false }));
    expect(r.reasons.map((x) => x.code)).toContain('subscription_inactive');
  });
  it('data-fact blocks: gps, low coverage, limit, workflow', () => {
    const r = analyzeAction('day.close', ctx({ permissions: ['day.close'] }), 'en', {
      coveragePct: 60, minCoveragePct: 80,
    });
    expect(r.reasons.map((x) => x.code)).toContain('low_coverage');
    const g = analyzeAction('stock.transfer', ctx({ permissions: ['stock.transfer'] }), 'en', { gpsViolation: true, distanceM: 500, radiusM: 150 });
    expect(g.reasons.find((x) => x.code === 'gps_violation')?.detail).toBe('500m > 150m');
  });
  it('localizes reasons (ar)', () => {
    const r = analyzeAction('customer.create', ctx({ permissions: [] }), 'ar');
    expect(r.reasons[0].title).toMatch(/[؀-ۿ]/); // contains Arabic
  });
});

describe('copilot · screen help', () => {
  it('explains a known screen + longest-prefix match', () => {
    expect(explainScreen('/customers/123')?.title).toBe('Customers');
    expect(explainScreen('/field/journey')?.title).toBe('Today’s Journey');
    expect(explainScreen('/unknown/route')).toBeNull();
  });
  it('suggested questions per screen', () => {
    expect(suggestedQuestions('/settings/authz').length).toBeGreaterThan(0);
  });
});

describe('copilot · permission explainer', () => {
  it('returns label, group and default roles', () => {
    const e = explainPermission('day.close');
    expect(e?.group).toBe('field_ops');
    expect(e?.defaultRoles).toContain('Company Admin'); // admin holds '*'
  });
});

describe('copilot · training (role-aware)', () => {
  it('marks permitted by the user permission', () => {
    expect(trainingGuide('create_customer', ctx({ permissions: ['customer.create'] }))?.permitted).toBe(true);
    expect(trainingGuide('create_customer', ctx({ permissions: [] }))?.permitted).toBe(false);
    expect(trainingGuide('create_customer', ctx())?.steps.length).toBeGreaterThan(0);
  });
});
