import { createClient } from '@/lib/supabase/server';
import { getPlatformContext } from '@/lib/erp/platform-context';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { enabledNavFlags } from '@/lib/erp/nav-flags';
import { visibleSections, type NavItem } from '@/lib/erp/navigation';
import type { UserContext } from '@/lib/erp/auth-context';

/** Canonical Settings group order (Navigation Standard). Group label key == the
 *  group key, resolved with `t()` in the client. Single source: the groups are
 *  derived from the one settings catalog in navigation.ts via visibleSections, so
 *  the sidebar (collapsed to a link), the in-page Top Grouping, and the home grid
 *  all reflect exactly the same permission-aware set — no second taxonomy. */
export const SETTINGS_GROUP_ORDER = [
  'nav.groups.organization',
  'nav.groups.finance',
  'nav.groups.people',
  'nav.groups.products',
  'nav.groups.automation',
  'nav.groups.integrations',
  'nav.groups.personal',
] as const;

export interface SettingsNavGroup { key: string; items: NavItem[] }

/**
 * Resolve the visible Settings catalog for a user, grouped into the canonical
 * groups. Reuses `visibleSections` with the SAME inputs the global sidebar uses
 * (perms, super-admin, platform context, modules, business type, feature flags),
 * so visibility is identical — no permission/RLS/flag behaviour change. Server
 * only (touches Supabase + platform context).
 */
export async function resolveSettingsNavGroups(ctx: UserContext): Promise<SettingsNavGroup[]> {
  const pctx = await getPlatformContext();
  const isPlatformStaff = Boolean(pctx?.isStaff);
  const platformPermissions: string[] = pctx?.permissions ?? [];
  const tenantFeatures = await getFeatureFlags(await createClient(), ctx.companyId);
  const navFlags = [
    ...enabledNavFlags(),
    ...Object.keys(tenantFeatures).filter((k) => tenantFeatures[k]),
  ];

  const sections = visibleSections(
    ctx.permissions,
    ctx.isSuperAdmin,
    ctx.isPlatformOwner,
    ctx.modules,
    platformPermissions,
    isPlatformStaff,
    ctx.company?.business_type ?? null,
    navFlags,
  );
  const settings = sections.find((s) => s.title === 'nav.sections.settings');
  // Exclude the Settings home link itself — it's the landing, not a group item.
  const items = (settings?.items ?? []).filter((i) => i.href !== '/settings');

  return SETTINGS_GROUP_ORDER
    .map((key) => ({ key, items: items.filter((i) => i.group === key) }))
    .filter((g) => g.items.length > 0);
}
