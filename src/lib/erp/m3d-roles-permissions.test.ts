import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAV_SECTIONS } from './navigation';

/**
 * M3-D (Roles & Permissions consolidation) — permission invariants.
 *
 * The merge folds /settings/permissions + /settings/action-policies into the
 * tabbed /settings/authz page. These guards assert the security-sensitive parts
 * documented in the M3 design package: the Permissions tab is SUPER-ADMIN only,
 * the write path stays super-admin guarded, and the nav consolidates cleanly.
 */
const ROOT = join(__dirname, '..', '..', '..');

describe('M3-D — Roles & Permissions permission invariants', () => {
  it('the Permissions tab is gated to super-admins in the merged authz page', () => {
    const src = readFileSync(join(ROOT, 'src', 'app', '(app)', 'settings', 'authz', 'page.tsx'), 'utf8');
    // view gate: the tab is computed from isSuperAdmin …
    expect(src).toContain('const showPerms = ctx.isSuperAdmin === true');
    // … a non-super ?tab=permissions request falls back (only honoured when showPerms) …
    expect(src).toContain("sp.tab === 'permissions' && showPerms");
    // … and the tab is only listed when showPerms.
    expect(src).toMatch(/\.\.\.\(showPerms \?/);
  });

  it('the role-permission write path remains super-admin guarded (unchanged)', () => {
    const src = readFileSync(join(ROOT, 'src', 'app', '(app)', 'settings', 'permissions', 'actions.ts'), 'utf8');
    expect(src).toContain('requireSuperAdmin');
    // guard is applied inside the mutating action(s), not merely declared
    expect((src.match(/requireSuperAdmin\(\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('the Action Policies + Roles tabs keep the company-admin gate', () => {
    const src = readFileSync(join(ROOT, 'src', 'app', '(app)', 'settings', 'authz', 'page.tsx'), 'utf8');
    expect(src).toContain("ctx.memberships.some((m) => m.role === 'admin')");
  });

  it('nav consolidates the three pages into a single Roles & Permissions entry', () => {
    const settings = NAV_SECTIONS.find((s) => s.title === 'nav.sections.settings')!;
    const hrefs = settings.items.map((i) => i.href);
    expect(hrefs).toContain('/settings/authz');
    expect(hrefs).not.toContain('/settings/permissions');
    expect(hrefs).not.toContain('/settings/action-policies');
  });
});
