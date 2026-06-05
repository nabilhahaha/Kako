import { describe, it, expect } from 'vitest';
import { NAV_SECTIONS, ALL_MODULES, MODULE_LABELS, type Module } from './navigation';
import { ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_GROUP_LABELS, type Permission } from './permissions';

/**
 * Architecture-integrity guards (full-platform QA hardening). These catch the
 * classes of drift a unit test can prove without a DB: dead permission keys in
 * the nav, nav module gates referencing unknown modules, catalog inconsistencies
 * between the Module/Permission types and their label maps, and newly-orphaned
 * modules (a licensable module with no UI surface).
 */

// Collect every permission/module referenced as a gate in the sidebar.
const navPerms = new Set<string>();
const navModules = new Set<string>();
for (const section of NAV_SECTIONS) {
  for (const m of Array.isArray(section.module) ? section.module : section.module ? [section.module] : []) navModules.add(m);
  for (const item of section.items) {
    for (const p of Array.isArray(item.perm) ? item.perm : item.perm ? [item.perm] : []) navPerms.add(p);
    for (const m of Array.isArray(item.module) ? item.module : item.module ? [item.module] : []) navModules.add(m);
  }
}

describe('architecture — navigation references resolve to real catalog entries', () => {
  it('every permission referenced in the sidebar exists in ALL_PERMISSIONS (no dead/typo perms)', () => {
    const dead = [...navPerms].filter((p) => !(ALL_PERMISSIONS as string[]).includes(p));
    expect(dead, `nav references unknown permissions: ${dead.join(', ')}`).toEqual([]);
  });

  it('every module gate in the sidebar is a real module (incl. item-level refinements)', () => {
    // The valid universe is the full Module type = MODULE_LABELS keys (ALL_MODULES
    // is only the plan-gateable subset; sales_orders/returns/warehousing are valid
    // item-level refinement modules used as nav gates).
    const validModules = new Set(Object.keys(MODULE_LABELS));
    const dead = [...navModules].filter((m) => !validModules.has(m));
    expect(dead, `nav references unknown modules: ${dead.join(', ')}`).toEqual([]);
  });
});

describe('architecture — catalog consistency', () => {
  it('every plan-gateable module has bilingual labels', () => {
    for (const m of ALL_MODULES) {
      expect(MODULE_LABELS[m]?.en?.length, `missing en label for module ${m}`).toBeGreaterThan(0);
      expect(MODULE_LABELS[m]?.ar?.length, `missing ar label for module ${m}`).toBeGreaterThan(0);
    }
  });

  it('every permission has a label and a known group', () => {
    const groupKeys = new Set(Object.keys(PERMISSION_GROUP_LABELS));
    for (const p of ALL_PERMISSIONS) {
      const label = PERMISSION_LABELS[p];
      expect(label?.en?.length, `missing en label for permission ${p}`).toBeGreaterThan(0);
      expect(label?.ar?.length, `missing ar label for permission ${p}`).toBeGreaterThan(0);
      expect(groupKeys.has(label.group), `permission ${p} has unknown group "${label.group}"`).toBe(true);
    }
  });
});

describe('architecture — orphan-module guard (documents the known invisible modules)', () => {
  // A "licensable but invisible" module has no nav gate anywhere. This is allowed
  // for a documented few (capability modules surfaced via permissions/settings,
  // not a section). Pinning the set means a NEWLY-orphaned module fails the test
  // and must be either gated in nav or added here with a reason.
  const KNOWN_UNGATED: Module[] = [
    'integrations', // surfaced under Settings (gated by integrations.manage perm), not a module-gated nav section
  ];

  it('no module is silently orphaned (ungated) beyond the documented allowlist', () => {
    const ungated = (ALL_MODULES as Module[]).filter((m) => !navModules.has(m));
    const unexpected = ungated.filter((m) => !KNOWN_UNGATED.includes(m));
    expect(unexpected, `newly-orphaned module(s) with no nav surface: ${unexpected.join(', ')}`).toEqual([]);
  });
});
