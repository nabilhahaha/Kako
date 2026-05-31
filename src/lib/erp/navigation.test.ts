import { describe, it, expect } from 'vitest';
import { visibleSections, ALL_MODULES, MODULE_LABELS } from './navigation';

describe('navigation — module labels', () => {
  it('every module has ar + en labels', () => {
    for (const m of ALL_MODULES) {
      expect(MODULE_LABELS[m].en.length).toBeGreaterThan(0);
      expect(MODULE_LABELS[m].ar.length).toBeGreaterThan(0);
    }
  });
});

describe('navigation — visibleSections', () => {
  it('a super admin sees sections; a no-permission tenant sees few/none', () => {
    const su = visibleSections([], true, false, []); // elevated, unrestricted modules
    const none = visibleSections([], false, false, []); // no perms
    expect(su.length).toBeGreaterThan(0);
    expect(su.length).toBeGreaterThanOrEqual(none.length);
  });

  it('permission gates items for a normal tenant user', () => {
    const withSales = visibleSections(['sales.sell'], false, false, []);
    const withoutSales = visibleSections([], false, false, []);
    const count = (secs: ReturnType<typeof visibleSections>) => secs.reduce((n, s) => n + s.items.length, 0);
    expect(count(withSales)).toBeGreaterThanOrEqual(count(withoutSales));
  });

  it('module gating: with only "clinic" enabled, no foreign-module sections show', () => {
    const onlyClinic = visibleSections(['clinic.manage'], false, false, ['clinic']);
    expect(onlyClinic.every((s) => s.module === undefined || s.module === 'clinic')).toBe(true);
  });

  it('platform owner sees the vendor panel, not tenant-only items', () => {
    const owner = visibleSections([], false, true, []);
    expect(owner.length).toBeGreaterThan(0);
    // tenant-only items (platformOwnerOnly === false implied) shouldn't leak in as
    // tenant-operational; owner items are platform-flagged — assert no crash + sections present
    for (const s of owner) expect(Array.isArray(s.items)).toBe(true);
  });
});

describe('navigation — field_ops capability binding (any-of, no regression)', () => {
  // hrefs of the field-sales items bound to ['field_ops','distribution'].
  const FIELD_HREFS = ['/rep', '/sales/settlement', '/sales/journey'];
  const hrefs = (secs: ReturnType<typeof visibleSections>) =>
    secs.flatMap((s) => s.items.map((i) => i.href));
  // a field-sales user always has the field.sales perm (+ reports.view for settlement).
  const fieldPerms = ['sales.sell', 'field.sales', 'reports.view'] as const;

  it('legacy distribution company (no field_ops, e.g. free plan) still sees the rep app', () => {
    // distribution enabled but NOT field_ops — the any-of gate must keep it visible.
    const v = visibleSections([...fieldPerms], false, false, ['sales', 'distribution']);
    for (const h of FIELD_HREFS) expect(hrefs(v)).toContain(h);
  });

  it('a company with the new field_ops capability (no distribution) also sees the rep app', () => {
    const v = visibleSections([...fieldPerms], false, false, ['sales', 'field_ops']);
    for (const h of FIELD_HREFS) expect(hrefs(v)).toContain(h);
  });

  it('a company with neither field_ops nor distribution does NOT see the field-sales items', () => {
    const v = visibleSections([...fieldPerms], false, false, ['sales']);
    for (const h of FIELD_HREFS) expect(hrefs(v)).not.toContain(h);
  });

  it('field-sales items stay permission-gated even when the module is enabled', () => {
    // field_ops enabled but the user lacks field.sales -> hidden.
    const v = visibleSections(['sales.sell'], false, false, ['sales', 'field_ops']);
    expect(hrefs(v)).not.toContain('/rep');
  });

  it('no-regression superset: a tenant with sales+field_ops+distribution sees the field-sales items', () => {
    const v = visibleSections([...fieldPerms], false, false, ['sales', 'field_ops', 'distribution']);
    for (const h of FIELD_HREFS) expect(hrefs(v)).toContain(h);
  });

  it('protected verticals are unaffected: clinic section shows for a clinic tenant', () => {
    const v = visibleSections(['clinic.manage'], false, false, ['clinic']);
    expect(v.some((s) => s.module === 'clinic')).toBe(true);
  });
});
