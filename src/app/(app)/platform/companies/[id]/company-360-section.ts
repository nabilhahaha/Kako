/** Company 360 — section model + deep-link mapping (pure; no React, no
 *  `'use client'`). Lives in its own module so BOTH the server page
 *  (`page.tsx`, which maps `?tab=` → section) and the client workspace
 *  (`company-360.tsx`) can import it. Exporting `tabToSection` from the
 *  client component would make it a client-only reference and crash the
 *  server page with "Attempted to call tabToSection() from the server". */

export type SectionKey =
  | 'summary' | 'subscription' | 'users' | 'roles' | 'modules'
  | 'routePlanner' | 'workflow' | 'packs' | 'integrations' | 'usage' | 'audit';

export const SECTION_ORDER: SectionKey[] = [
  'summary', 'subscription', 'users', 'roles', 'modules',
  'routePlanner', 'workflow', 'packs', 'integrations', 'usage', 'audit',
];

/** Maps legacy ?tab= values to the new anchor section (back-compat). */
export function tabToSection(tab: string | undefined): SectionKey {
  switch (tab) {
    case 'overview': return 'summary';
    case 'subscription': return 'subscription';
    case 'users': return 'users';
    case 'roles':
    case 'permissions': return 'roles';
    case 'modules': return 'modules';
    case 'routePlanner':
    case 'route-planner': return 'routePlanner';
    case 'workflow':
    case 'settings': return 'workflow';
    case 'packs': return 'packs';
    case 'integrations': return 'integrations';
    case 'audit': return 'audit';
    default: return 'summary';
  }
}
