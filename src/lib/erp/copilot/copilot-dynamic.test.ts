import { describe, it, expect } from 'vitest';
import { roleCapabilities, canDoAction, describeCompanyRule, analyzeAction, type CopilotContext } from './copilot-engine';

// These prove the Copilot is DYNAMIC: its answers are derived from the live
// permission/module/settings values supplied at runtime (resolved from
// erp_company_role_permissions / erp_company_modules / erp_fmcg_settings by
// copilot-live-context.ts), not from hardcoded role assumptions.

const ctx = (over: Partial<CopilotContext> = {}): CopilotContext => ({
  permissions: [], modules: ['sales', 'inventory'], roles: ['salesman'], topRole: 'salesman',
  isSuperAdmin: false, isPlatformOwner: false, companyActive: true, ...over,
});

describe('copilot · dynamic — changing a role’s permissions changes answers', () => {
  it('roleCapabilities reflects the live permission set (add/remove)', () => {
    const before = roleCapabilities(['customers.manage']);
    const after = roleCapabilities(['customers.manage', 'day.close']);
    expect(JSON.stringify(after)).not.toEqual(JSON.stringify(before));
    expect(after.flatMap((g) => g.items).length).toBeGreaterThan(before.flatMap((g) => g.items).length);
  });

  it('canDoAction flips when the permission is granted/removed (stops suggesting)', () => {
    expect(canDoAction('customer.create', ['customers.manage'], ['inventory'])).toBe(true);
    // company removes the grant → Copilot must no longer say it's allowed
    expect(canDoAction('customer.create', [], ['inventory'])).toBe(false);
  });

  it('whyBlocked answer changes the moment the live permission set changes', () => {
    const blocked = analyzeAction('day.close', ctx({ permissions: [] }));
    const allowed = analyzeAction('day.close', ctx({ permissions: ['day.close'] }));
    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });
});

describe('copilot · dynamic — disabled modules are reflected', () => {
  it('canDoAction false when the module is not in the live module set', () => {
    expect(canDoAction('product.create', ['inventory.view'], ['inventory'])).toBe(true);
    expect(canDoAction('product.create', ['inventory.view'], ['sales'])).toBe(false); // inventory disabled
  });
  it('analyzeAction returns module_not_enabled from live modules', () => {
    const r = analyzeAction('accounting.post', ctx({ permissions: ['accounting.post'], modules: ['sales'] }));
    expect(r.reasons.map((x) => x.code)).toContain('module_not_enabled');
  });
});

describe('copilot · dynamic — company-specific settings change answers', () => {
  it('describeCompanyRule uses the live value, not a hardcoded default', () => {
    expect(describeCompanyRule('gps_radius', 150)).toContain('150');
    expect(describeCompanyRule('gps_radius', 300)).toContain('300');
    expect(describeCompanyRule('gps_radius', 150)).not.toEqual(describeCompanyRule('gps_radius', 300));
  });
  it('day-close coverage block uses the live company threshold', () => {
    const strict = analyzeAction('day.close', ctx({ permissions: ['day.close'] }), 'en', { coveragePct: 85, minCoveragePct: 90 });
    const lenient = analyzeAction('day.close', ctx({ permissions: ['day.close'] }), 'en', { coveragePct: 85, minCoveragePct: 80 });
    expect(strict.reasons.map((r) => r.code)).toContain('low_coverage'); // 85 < 90
    expect(lenient.reasons.map((r) => r.code)).not.toContain('low_coverage'); // 85 >= 80
  });
});

describe('copilot · dynamic — a brand-new role is explained from its live grants', () => {
  it('roleCapabilities works for an arbitrary new role given its live permissions', () => {
    // Simulate a freshly created "trade_marketing_manager"-style role with live grants.
    const caps = roleCapabilities(['pricing.manage', 'reports.view', 'customers.manage']);
    const flat = caps.flatMap((g) => g.items);
    expect(flat.length).toBe(3);
    // unknown/granular keys pass through verbatim (nothing hidden)
    const withGranular = roleCapabilities(['sales.price.override']);
    expect(withGranular.flatMap((g) => g.items)).toContain('sales.price.override');
  });
});
