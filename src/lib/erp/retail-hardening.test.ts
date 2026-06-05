import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Retail Mode URL hardening — every platform/enterprise admin page that is hidden
 * from the retail sidebar must ALSO enforce `requireNonRetailAdmin()` at the page
 * (or layout) level, so a single-store tenant cannot reach it by direct URL, deep
 * link, or refresh. This is the server-side companion to the nav curation.
 */
const APP = join(process.cwd(), 'src/app/(app)');

// Admin routes blocked in Retail Mode → the file that must carry the guard.
const GUARDED: { route: string; file: string }[] = [
  ...[
    'permissions', 'audit-log', 'organization', 'regions', 'marketplace', 'einvoice',
    'authz', 'field-governance', 'custom-fields', 'customer-data', 'uom', 'msl',
    'surveys', 'outlet-grades', 'workflows', 'integration-hub', 'integrations',
    'import', 'export', 'onboarding', 'data-onboarding',
  ].map((s) => ({ route: `/settings/${s}`, file: `settings/${s}/page.tsx` })),
  { route: '/platform/audit', file: 'platform/audit/page.tsx' },
  { route: '/design', file: 'design/layout.tsx' }, // client page guarded via its server layout
];

describe('Retail Mode — URL hardening on admin pages', () => {
  it('every retail-hidden admin route enforces requireNonRetailAdmin()', () => {
    const missing: string[] = [];
    for (const { route, file } of GUARDED) {
      const path = join(APP, file);
      if (!existsSync(path)) { missing.push(`${route} (file missing: ${file})`); continue; }
      const src = readFileSync(path, 'utf8');
      if (!src.includes('requireNonRetailAdmin')) missing.push(`${route} (no guard in ${file})`);
    }
    expect(missing, `unguarded retail-blocked admin routes:\n${missing.join('\n')}`).toEqual([]);
  });
});
