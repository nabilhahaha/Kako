import { describe, it, expect } from 'vitest';
import { INDUSTRY_PACKS, INDUSTRY_PACK_IDS, getIndustryPack } from './industry-packs';
import {
  PERMISSION_TEMPLATES,
  PERMISSION_TEMPLATE_IDS,
  composeOnboarding,
  getPermissionTemplate,
} from './permission-templates';
import { DENY_ALL_CAPABILITIES } from './granular-capabilities';
import { LIMIT_ACTIONS } from './limits';
import { SCOPE_DIMENSIONS } from './scope';

describe('industry packs', () => {
  it('exposes the seven packs with bilingual labels + a business type', () => {
    expect(INDUSTRY_PACK_IDS.sort()).toEqual(
      ['clinic', 'fmcg', 'generic', 'manufacturing', 'pharmacy', 'retail', 'services'].sort(),
    );
    for (const id of INDUSTRY_PACK_IDS) {
      const p = INDUSTRY_PACKS[id];
      expect(p.labelEn.length).toBeGreaterThan(0);
      expect(p.labelAr.length).toBeGreaterThan(0);
      expect(p.businessType.length).toBeGreaterThan(0);
      expect(p.roles).toContain('admin'); // every company has an admin
      expect(p.modules.length).toBeGreaterThan(0);
      expect(p.checklist.length).toBeGreaterThan(0);
    }
  });
  it('FMCG pack carries the full FMCG distribution role set incl. Trade Marketing Manager', () => {
    const fmcg = getIndustryPack('fmcg')!;
    for (const r of [
      'admin', 'sales_director', 'regional_manager', 'branch_manager', 'supervisor',
      'salesman', 'warehouse_keeper', 'accountant', 'trade_marketing_manager',
    ]) {
      expect(fmcg.roles).toContain(r);
    }
    expect(fmcg.businessType).toBe('wholesale');
    expect(fmcg.sensitiveSections.length).toBeGreaterThan(0);
  });
});

describe('permission templates', () => {
  it('exposes the four templates', () => {
    expect(PERMISSION_TEMPLATE_IDS.sort()).toEqual(['custom', 'enterprise', 'restricted', 'standard'].sort());
    for (const id of PERMISSION_TEMPLATE_IDS) expect(getPermissionTemplate(id)?.labelEn.length).toBeGreaterThan(0);
  });
});

describe('composeOnboarding — decoupling (same pack, different security models)', () => {
  const fmcg = INDUSTRY_PACKS.fmcg;

  it('Standard: functional ownership + moderate limits + junior-only section hiding', () => {
    const { payload, recommendedScopes } = composeOnboarding(fmcg, 'standard');
    expect(payload.capabilities['admin']).toEqual([...DENY_ALL_CAPABILITIES]);
    expect(payload.capabilities['accountant']).toContain('accounting.voucher.approve');
    expect(payload.capabilities['regional_manager']).toContain('sales.price.override');
    // moderate branch PO limit
    expect(payload.limits.find((l) => l.role_key === 'branch_manager' && l.action === 'purchasing.po.approve')?.max_amount).toBe(100000);
    // junior role hidden from a sensitive section; finance is NOT hidden
    const hiddenSubjects = payload.section_access.map((s) => s.subject_key);
    expect(hiddenSubjects).toContain('salesman');
    expect(hiddenSubjects).not.toContain('accountant');
    // recommended scope reflects the hierarchy
    expect(recommendedScopes['salesman']).toBe('own_customers');
    expect(recommendedScopes['supervisor']).toBe('own_team');
    expect(recommendedScopes['regional_manager']).toBe('region');
  });

  it('Enterprise: tighter limits + price-override narrowed to sales_director + finance-only section visibility', () => {
    const { payload } = composeOnboarding(fmcg, 'enterprise');
    // narrower: regional_manager + trade_marketing_manager lose price.override
    expect(payload.capabilities['regional_manager'] ?? []).not.toContain('sales.price.override');
    expect(payload.capabilities['trade_marketing_manager'] ?? []).not.toContain('sales.price.override');
    expect(payload.capabilities['sales_director']).toContain('sales.price.override');
    // tighter PO limit
    expect(payload.limits.find((l) => l.role_key === 'branch_manager' && l.action === 'purchasing.po.approve')?.max_amount).toBe(50000);
    // sensitive sections hidden from non-finance roles (e.g. branch_manager hidden, accountant visible)
    const hidden = payload.section_access.filter((s) => s.entity === 'customer' && s.section_key === 'financial').map((s) => s.subject_key);
    expect(hidden).toContain('branch_manager');
    expect(hidden).not.toContain('accountant');
  });

  it('Restricted: only admin holds caps; everyone else hidden from sensitive sections', () => {
    const { payload } = composeOnboarding(fmcg, 'restricted');
    expect(Object.keys(payload.capabilities)).toEqual(['admin']);
    expect(payload.capabilities['admin']).toEqual([...DENY_ALL_CAPABILITIES]);
    const hidden = payload.section_access.filter((s) => s.entity === 'customer' && s.section_key === 'financial').map((s) => s.subject_key);
    expect(hidden).toContain('accountant'); // even finance is hidden under restricted
    expect(hidden).not.toContain('admin');
  });

  it('Custom: grants nothing — a blank slate for the Authz Console', () => {
    const { payload, recommendedScopes } = composeOnboarding(fmcg, 'custom');
    expect(payload.capabilities).toEqual({});
    expect(payload.limits).toEqual([]);
    expect(payload.section_access).toEqual([]);
    expect(recommendedScopes).toEqual({});
  });

  it('the SAME pack yields DIFFERENT payloads per template (not hard-coupled)', () => {
    const std = composeOnboarding(fmcg, 'standard');
    const ent = composeOnboarding(fmcg, 'enterprise');
    const res = composeOnboarding(fmcg, 'restricted');
    expect(std.summary).not.toEqual(ent.summary);
    expect(ent.summary).not.toEqual(res.summary);
    // and the SAME template works across DIFFERENT packs
    const retailStd = composeOnboarding(INDUSTRY_PACKS.retail, 'standard');
    expect(retailStd.payload.roles).not.toEqual(std.payload.roles);
  });
});

describe('composeOnboarding — payload integrity (matches the apply RPC contract)', () => {
  it('every granted capability is a real deny-all capability', () => {
    for (const packId of INDUSTRY_PACK_IDS) {
      for (const tpl of PERMISSION_TEMPLATE_IDS) {
        const { payload } = composeOnboarding(INDUSTRY_PACKS[packId], tpl);
        for (const caps of Object.values(payload.capabilities)) {
          for (const c of caps) expect(DENY_ALL_CAPABILITIES).toContain(c);
        }
      }
    }
  });
  it('every limit uses a valid limit action and is attached to a pack role', () => {
    for (const packId of INDUSTRY_PACK_IDS) {
      const pack = INDUSTRY_PACKS[packId];
      for (const tpl of PERMISSION_TEMPLATE_IDS) {
        const { payload } = composeOnboarding(pack, tpl);
        for (const l of payload.limits) {
          expect(LIMIT_ACTIONS).toContain(l.action);
          expect(pack.roles).toContain(l.role_key);
        }
      }
    }
  });
  it('recommended scopes are valid dimensions; section rows are role/hidden|view', () => {
    const { payload, recommendedScopes } = composeOnboarding(INDUSTRY_PACKS.fmcg, 'standard');
    for (const d of Object.values(recommendedScopes)) expect(SCOPE_DIMENSIONS).toContain(d);
    for (const s of payload.section_access) {
      expect(s.subject_type).toBe('role');
      expect(['hidden', 'view']).toContain(s.access);
    }
  });
});
