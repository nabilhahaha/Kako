import {
  Building2, Receipt, Hash, Users, ShieldCheck, UserCog, Network, Map, Layers,
  GitBranch, LayoutGrid, Plug, RefreshCw, Upload, Coins, type LucideIcon,
} from 'lucide-react';
import { hasPermission, type Permission } from './permissions';
import type { Module } from './navigation';
import type { UserContext } from './auth-context';

/**
 * Settings hub catalog — the permission-aware list of settings areas, shared by
 * the Settings home grid and the persistent Settings navigation. Pure data +
 * a visibility predicate; no writes, no logic change.
 */
/** The five top-level Settings groups (Navigation Standard re-chunk). Each flat
 *  settings page belongs to exactly one group; the group is the top-grouping
 *  tab, the page is the second-tier tab. Labels are i18n keys (ar/en parity). */
export type SettingsGroupKey = 'organization' | 'people' | 'catalog' | 'workflows' | 'integrations';
export const SETTINGS_GROUPS: { key: SettingsGroupKey; label: string }[] = [
  { key: 'organization', label: 'settingsHome.groups.organization' },
  { key: 'people', label: 'settingsHome.groups.people' },
  { key: 'catalog', label: 'settingsHome.groups.catalog' },
  { key: 'workflows', label: 'settingsHome.groups.workflows' },
  { key: 'integrations', label: 'settingsHome.groups.integrations' },
];

export interface SettingsItem {
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  group: SettingsGroupKey;
  perm?: Permission;
  superAdminOnly?: boolean;
  module?: Module;
}
export interface SettingsSection { title: string; items: SettingsItem[] }

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { title: 'settingsHome.sections.company', items: [
    { label: 'settingsHome.branches', desc: 'settingsHome.branchesDesc', href: '/settings/branches', icon: Building2, group: 'organization', perm: 'settings.branches' },
    { label: 'settingsHome.finance', desc: 'settingsHome.financeDesc', href: '/settings/finance', icon: Coins, group: 'organization', perm: 'settings.branches' },
    { label: 'settingsHome.taxReg', desc: 'settingsHome.taxRegDesc', href: '/settings/tax-registrations', icon: Receipt, group: 'organization', perm: 'settings.branches' },
    { label: 'settingsHome.numbering', desc: 'settingsHome.numberingDesc', href: '/settings/numbering', icon: Hash, group: 'organization', perm: 'settings.branches' },
  ]},
  { title: 'settingsHome.sections.people', items: [
    { label: 'settingsHome.users', desc: 'settingsHome.usersDesc', href: '/settings/users', icon: Users, group: 'people', superAdminOnly: true },
    { label: 'settingsHome.staff', desc: 'settingsHome.staffDesc', href: '/settings/staff', icon: UserCog, group: 'people', perm: 'settings.users' },
    { label: 'settingsHome.permissions', desc: 'settingsHome.permissionsDesc', href: '/settings/permissions', icon: ShieldCheck, group: 'people', superAdminOnly: true },
  ]},
  { title: 'settingsHome.sections.org', items: [
    { label: 'settingsHome.orgStructure', desc: 'settingsHome.orgStructureDesc', href: '/settings/organization-structure', icon: Network, group: 'organization', perm: 'settings.users' },
    { label: 'settingsHome.reporting', desc: 'settingsHome.reportingDesc', href: '/settings/organization', icon: UserCog, group: 'organization', perm: 'settings.users' },
    { label: 'settingsHome.regions', desc: 'settingsHome.regionsDesc', href: '/settings/regions', icon: Map, group: 'organization', perm: 'settings.branches' },
  ]},
  { title: 'settingsHome.sections.products', items: [
    { label: 'settingsHome.productStructure', desc: 'settingsHome.productStructureDesc', href: '/settings/product-structure', icon: Layers, group: 'catalog', perm: 'product.edit' },
    { label: 'settingsHome.uom', desc: 'settingsHome.uomDesc', href: '/settings/uom', icon: Layers, group: 'catalog', perm: 'uom.manage' },
  ]},
  { title: 'settingsHome.sections.workflows', items: [
    { label: 'settingsHome.approvalMatrix', desc: 'settingsHome.approvalMatrixDesc', href: '/settings/approval-matrix', icon: ShieldCheck, group: 'workflows', perm: 'workflow.manage', module: 'workflow' },
    { label: 'settingsHome.workflows', desc: 'settingsHome.workflowsDesc', href: '/settings/workflows', icon: GitBranch, group: 'workflows', perm: 'workflow.manage', module: 'workflow' },
    { label: 'settingsHome.workflowTemplates', desc: 'settingsHome.workflowTemplatesDesc', href: '/settings/workflows/templates', icon: LayoutGrid, group: 'workflows', perm: 'workflow.manage', module: 'workflow' },
  ]},
  { title: 'settingsHome.sections.integrations', items: [
    { label: 'settingsHome.integrationHub', desc: 'settingsHome.integrationHubDesc', href: '/settings/integration-hub', icon: Network, group: 'integrations', perm: 'integrations.manage', module: 'integrations' },
    { label: 'settingsHome.import', desc: 'settingsHome.importDesc', href: '/settings/import', icon: Upload, group: 'integrations', perm: 'integrations.manage', module: 'integrations' },
    { label: 'settingsHome.connections', desc: 'settingsHome.connectionsDesc', href: '/settings/integrations/connections', icon: Plug, group: 'integrations', perm: 'integrations.manage', module: 'integrations' },
    { label: 'settingsHome.sync', desc: 'settingsHome.syncDesc', href: '/settings/integrations/sync', icon: RefreshCw, group: 'integrations', perm: 'integrations.manage', module: 'integrations' },
  ]},
  { title: 'settingsHome.sections.modules', items: [
    { label: 'settingsHome.features', desc: 'settingsHome.featuresDesc', href: '/settings/features', icon: LayoutGrid, group: 'catalog', perm: 'settings.users' },
    { label: 'settingsHome.marketplace', desc: 'settingsHome.marketplaceDesc', href: '/settings/marketplace', icon: LayoutGrid, group: 'catalog', perm: 'settings.users' },
  ]},
];

/** All settings items, flattened (catalog order). */
const ALL_SETTINGS_ITEMS: SettingsItem[] = SETTINGS_SECTIONS.flatMap((s) => s.items);

/** Visible groups (with their visible pages) for the caller — serializable, for
 *  the two-tier Settings TopGroupingNav. Drops empty groups. No logic change. */
export function visibleSettingsGroups(allowedHrefs: string[]): {
  key: SettingsGroupKey; label: string; items: { label: string; href: string }[];
}[] {
  const allow = new Set(allowedHrefs);
  return SETTINGS_GROUPS
    .map((g) => ({
      key: g.key,
      label: g.label,
      items: ALL_SETTINGS_ITEMS.filter((i) => i.group === g.key && allow.has(i.href)).map((i) => ({ label: i.label, href: i.href })),
    }))
    .filter((g) => g.items.length > 0);
}

/** Permission-aware visibility for a settings item (mirrors the home grid). */
export function canSeeSettingsItem(ctx: UserContext, i: SettingsItem): boolean {
  return (
    (i.superAdminOnly ? ctx.isSuperAdmin : true) &&
    (i.perm ? hasPermission(ctx, i.perm) : true) &&
    (i.module ? ctx.modules.includes(i.module) : true)
  );
}

/** The hrefs the caller may see — passed (serializable) to the client nav. */
export function allowedSettingsHrefs(ctx: UserContext): string[] {
  return SETTINGS_SECTIONS.flatMap((s) => s.items).filter((i) => canSeeSettingsItem(ctx, i)).map((i) => i.href);
}
