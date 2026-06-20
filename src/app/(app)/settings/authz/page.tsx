import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ModulePage } from '@/components/admin/module-page';
import { TopGroupingNav } from '@/components/admin/top-grouping-nav';
import { listEntities } from '@/lib/erp/entities';
import { loadAuthzConsole } from '@/lib/erp/authz-console-server';
import { loadRoleOverridesConsole } from '@/lib/erp/role-overrides-server';
import { loadAccessOverridesConsole } from '@/lib/erp/access-overrides-server';
import { DELEGABLE_OPERATIONAL_PERMISSIONS, groupOperationalPermissions } from '@/lib/role-governance';
import { getAllActionPolicies } from '@/lib/erp/action-policy';
import { CRITICAL_ACTIONS_BY_KEY } from '@/lib/erp/critical-actions-catalog';
import { RolesWorkbench } from './roles-workbench';
import { PermissionsMatrix, type RoleRow } from '../permissions/permissions-matrix';
import { ActionPoliciesManager, type PolicyView } from '../action-policies/action-policies-manager';

export const dynamic = 'force-dynamic';

/**
 * Roles & Permissions (M3-D) — the Authorization Console with three tabs that
 * render their existing managers verbatim: Roles (RolesWorkbench), Permissions
 * (PermissionsMatrix) and Action Policies (ActionPoliciesManager). Tabs are
 * URL-addressable (`?tab=`).
 *
 * GATES (preserved exactly):
 *  - Page + Roles + Action Policies: Company-Admin OR Platform-Owner
 *    (requireCompanyAdmin) — identical to the previous /settings/authz and
 *    /settings/action-policies pages.
 *  - Permissions tab: SUPER-ADMIN ONLY — the tab is listed and its content is
 *    rendered only when ctx.isSuperAdmin (a non-super request for
 *    ?tab=permissions falls back to Roles). The PermissionsMatrix `canEdit` and
 *    the `setRolePermission` super-admin server guard are unchanged. This mirrors
 *    the prior nav gating (permissions was superAdminOnly).
 */
type Tab = 'roles' | 'permissions' | 'action-policies';

export default async function AuthzConsolePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();

  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('authz.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('authz.adminOnly')}</CardContent></Card>
      </div>
    );
  }

  const showPerms = ctx.isSuperAdmin === true; // documented super-admin guard
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'action-policies'
    ? 'action-policies'
    : sp.tab === 'permissions' && showPerms
      ? 'permissions'
      : 'roles';

  const supabase = await createClient();
  let content: React.ReactNode;

  if (tab === 'permissions') {
    // super-admin only (guarded above)
    const [{ data: roles }, { data: rolePerms }] = await Promise.all([
      supabase.from('erp_roles').select('key, name_ar, is_system, rank').order('rank', { ascending: false }),
      supabase.from('erp_role_permissions').select('role_key, permission'),
    ]);
    const permsByRole: Record<string, string[]> = {};
    for (const rp of rolePerms ?? []) (permsByRole[rp.role_key] ??= []).push(rp.permission);
    content = <PermissionsMatrix roles={(roles as RoleRow[]) ?? []} permsByRole={permsByRole} canEdit={ctx.isSuperAdmin} />;
  } else if (tab === 'action-policies') {
    const resolved = await getAllActionPolicies(supabase, ctx.companyId);
    const policies: PolicyView[] = resolved.map((p) => {
      const spec = CRITICAL_ACTIONS_BY_KEY[p.actionKey];
      return {
        actionKey: p.actionKey, domain: spec?.domain ?? 'sales', labelKey: spec?.labelKey ?? p.actionKey,
        status: spec?.status ?? 'planned', enabled: p.enabled, risk: p.risk, reasonRequired: p.reasonRequired,
        approvalRequired: p.approvalRequired, notifyTargets: p.notifyTargets, escalationTargets: p.escalationTargets,
        reversalAllowed: p.reversalAllowed, reversalPolicy: p.reversalPolicy, effectiveFrom: p.effectiveFrom, source: p.source,
      };
    });
    content = <ActionPoliciesManager policies={policies} locale={locale} />;
  } else {
    const data = await loadAuthzConsole(supabase, ctx);
    const entities = listEntities()
      .filter((e) => (e.fields?.length ?? 0) > 0)
      .map((e) => ({ key: e.key, labelAr: e.labelAr, labelEn: e.labelEn }));
    const [roleOv, uao] = await Promise.all([
      loadRoleOverridesConsole(supabase, ctx),
      loadAccessOverridesConsole(supabase, ctx),
    ]);
    const groups = groupOperationalPermissions(DELEGABLE_OPERATIONAL_PERMISSIONS);
    content = (
      <RolesWorkbench
        data={data}
        entities={entities}
        groups={groups}
        roleOverridesEnabled={roleOv.enabled}
        uaoEnabled={uao.enabled}
        uaoMembers={uao.members}
      />
    );
  }

  const tabs = [
    { key: 'roles', label: t('authz.title'), href: '/settings/authz?tab=roles', active: tab === 'roles' },
    ...(showPerms ? [{ key: 'permissions', label: t('settings.permissions.pageTitle'), href: '/settings/authz?tab=permissions', active: tab === 'permissions' }] : []),
    { key: 'action-policies', label: t('actionPolicies.title'), href: '/settings/authz?tab=action-policies', active: tab === 'action-policies' },
  ];

  return (
    <ModulePage nav={<TopGroupingNav items={tabs} ariaLabel={t('authz.title')} />}>
      {content}
    </ModulePage>
  );
}
