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
export interface SettingsItem {
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  perm?: Permission;
  superAdminOnly?: boolean;
  module?: Module;
}
export interface SettingsSection { title: string; items: SettingsItem[] }

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { title: 'settingsHome.sections.company', items: [
    { label: 'settingsHome.branches', desc: 'settingsHome.branchesDesc', href: '/settings/branches', icon: Building2, perm: 'settings.branches' },
    { label: 'settingsHome.finance', desc: 'settingsHome.financeDesc', href: '/settings/finance', icon: Coins, perm: 'settings.branches' },
    { label: 'settingsHome.taxReg', desc: 'settingsHome.taxRegDesc', href: '/settings/tax-registrations', icon: Receipt, perm: 'settings.branches' },
    { label: 'settingsHome.numbering', desc: 'settingsHome.numberingDesc', href: '/settings/numbering', icon: Hash, perm: 'settings.branches' },
  ]},
  { title: 'settingsHome.sections.people', items: [
    { label: 'settingsHome.users', desc: 'settingsHome.usersDesc', href: '/settings/users', icon: Users, superAdminOnly: true },
    { label: 'settingsHome.staff', desc: 'settingsHome.staffDesc', href: '/settings/staff', icon: UserCog, perm: 'settings.users' },
    { label: 'settingsHome.permissions', desc: 'settingsHome.permissionsDesc', href: '/settings/permissions', icon: ShieldCheck, superAdminOnly: true },
  ]},
  { title: 'settingsHome.sections.org', items: [
    { label: 'settingsHome.orgStructure', desc: 'settingsHome.orgStructureDesc', href: '/settings/organization-structure', icon: Network, perm: 'settings.users' },
    { label: 'settingsHome.reporting', desc: 'settingsHome.reportingDesc', href: '/settings/organization', icon: UserCog, perm: 'settings.users' },
    { label: 'settingsHome.regions', desc: 'settingsHome.regionsDesc', href: '/settings/regions', icon: Map, perm: 'settings.branches' },
  ]},
  { title: 'settingsHome.sections.products', items: [
    { label: 'settingsHome.productStructure', desc: 'settingsHome.productStructureDesc', href: '/settings/product-structure', icon: Layers, perm: 'product.edit' },
    { label: 'settingsHome.uom', desc: 'settingsHome.uomDesc', href: '/settings/uom', icon: Layers, perm: 'uom.manage' },
  ]},
  { title: 'settingsHome.sections.workflows', items: [
    { label: 'settingsHome.approvalMatrix', desc: 'settingsHome.approvalMatrixDesc', href: '/settings/approval-matrix', icon: ShieldCheck, perm: 'workflow.manage', module: 'workflow' },
    { label: 'settingsHome.workflows', desc: 'settingsHome.workflowsDesc', href: '/settings/workflows', icon: GitBranch, perm: 'workflow.manage', module: 'workflow' },
    { label: 'settingsHome.workflowTemplates', desc: 'settingsHome.workflowTemplatesDesc', href: '/settings/workflows/templates', icon: LayoutGrid, perm: 'workflow.manage', module: 'workflow' },
  ]},
  { title: 'settingsHome.sections.integrations', items: [
    { label: 'settingsHome.integrationHub', desc: 'settingsHome.integrationHubDesc', href: '/settings/integration-hub', icon: Network, perm: 'integrations.manage', module: 'integrations' },
    { label: 'settingsHome.import', desc: 'settingsHome.importDesc', href: '/settings/import', icon: Upload, perm: 'integrations.manage', module: 'integrations' },
    { label: 'settingsHome.connections', desc: 'settingsHome.connectionsDesc', href: '/settings/integrations/connections', icon: Plug, perm: 'integrations.manage', module: 'integrations' },
    { label: 'settingsHome.sync', desc: 'settingsHome.syncDesc', href: '/settings/integrations/sync', icon: RefreshCw, perm: 'integrations.manage', module: 'integrations' },
  ]},
  { title: 'settingsHome.sections.modules', items: [
    { label: 'settingsHome.features', desc: 'settingsHome.featuresDesc', href: '/settings/features', icon: LayoutGrid, perm: 'settings.users' },
    { label: 'settingsHome.marketplace', desc: 'settingsHome.marketplaceDesc', href: '/settings/marketplace', icon: LayoutGrid, perm: 'settings.users' },
  ]},
];

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
