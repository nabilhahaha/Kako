import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NAV_SECTIONS, visibleSections } from './navigation';

/**
 * Platform-governance regression guards (Chief-Architect hardening):
 *  1. Every sidebar nav item points at a real App Router page (no dead links —
 *     e.g. a mistyped /platform/plans would fail here, not in production).
 *  2. Every item in the vendor "provider" section is vendor-scoped
 *     (platformOwnerOnly OR platformPerm), so platform tools can never leak to a
 *     tenant via the `!item.perm` allow.
 *  3. A plain tenant's resolved sidebar contains NO /platform/* item.
 */

// repo root: this file is at src/lib/erp/navigation-routes.test.ts
const ROOT = join(__dirname, '..', '..', '..');
const APP = join(ROOT, 'src', 'app');

/** A static href resolves if a page.tsx exists under (app)<href> or <href>.
 *  Strips any #anchor / ?query first — a deep-link into a real page is valid. */
function routeExists(href: string): boolean {
  const path = href.split('#')[0].split('?')[0];
  const parts = path.split('/').filter(Boolean);
  return (
    existsSync(join(APP, '(app)', ...parts, 'page.tsx')) ||
    existsSync(join(APP, ...parts, 'page.tsx'))
  );
}

describe('navigation — route integrity (no dead sidebar links)', () => {
  it('every nav item resolves to an existing App Router page', () => {
    const missing: string[] = [];
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (!routeExists(item.href)) missing.push(`${section.title} → ${item.href}`);
      }
    }
    expect(missing, `dead nav links:\n${missing.join('\n')}`).toEqual([]);
  });
});

describe('navigation — platform governance invariants', () => {
  it('every provider-section item is vendor-scoped (owner-only or platformPerm)', () => {
    const provider = NAV_SECTIONS.find((s) => s.title === 'nav.sections.provider');
    expect(provider).toBeDefined();
    for (const item of provider!.items) {
      expect(
        item.platformOwnerOnly === true || typeof item.platformPerm === 'string',
        `provider item ${item.href} must be platformOwnerOnly or carry a platformPerm`,
      ).toBe(true);
    }
  });

  it('a non-privileged tenant (company admin) sees no vendor /platform/* beyond the shared allowlist', () => {
    // The ONLY /platform/* route intentionally shared with a company admin is the
    // per-company Confusion Analytics page (gated by the tenant perm
    // settings.users, company-scoped at the page). Everything else under
    // /platform/ is vendor-only. (Architecture note: copilot-analytics would be
    // cleaner under a non-/platform namespace — tracked in docs/AUTHORIZATION.md.)
    //
    // NOTE: `is_super_admin` is a GLOBAL god-tier in this system (the only super
    // admins are the platform owners), not a tenant role — it legitimately sees
    // platform tools (e.g. the forensic audit log), so this invariant targets the
    // ordinary, non-super company admin.
    const SHARED_ALLOWLIST = ['/platform/copilot-analytics'];
    const hrefs = visibleSections(
      ['settings.users', 'settings.branches', 'reports.view', 'sales.sell', 'inventory.view'],
      false, false, ['sales', 'inventory'],
    ).flatMap((s) => s.items.map((i) => i.href));
    const leaked = hrefs.filter((h) => h.startsWith('/platform/') && !SHARED_ALLOWLIST.includes(h));
    expect(leaked, `unexpected platform leak: ${leaked.join(', ')}`).toEqual([]);
  });
});
