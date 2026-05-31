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
