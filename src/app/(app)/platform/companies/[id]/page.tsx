import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Company, Profile } from '@/lib/erp/types';
import { CompanyDetail, type MemberRow, type IntegrationRow, type ApiKeyRow } from './company-detail';
import { CompanyPermissions, type CompanyRoleRow } from './company-permissions';
import { CompanyTabs, COMPANY_TAB_ORDER, type CompanyTabKey } from './company-tabs';
import { CompanyAudit, type CompanyAuditRow } from './company-audit';
import { getCompanyUsage, type Plan } from '@/lib/erp/plans';
import { getT } from '@/lib/i18n/server';

export default async function PlatformCompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner) {
    return (
      <div>
        <PageHeader title={t('platform.overview.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platform.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const tab: CompanyTabKey = COMPANY_TAB_ORDER.includes(rawTab as CompanyTabKey)
    ? (rawTab as CompanyTabKey)
    : 'overview';

  const supabase = await createClient();
  const { data: company } = await supabase
    .from('erp_companies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!company) notFound();

  const { data: branches } = await supabase
    .from('erp_branches')
    .select('*')
    .eq('company_id', id)
    .order('created_at', { ascending: true });

  const branchList = (branches as Branch[]) ?? [];
  const branchIds = branchList.map((b) => b.id);

  let members: MemberRow[] = [];
  if (branchIds.length > 0) {
    const { data: ubs } = await supabase
      .from('erp_user_branches')
      .select('user_id, branch_id, role, is_default')
      .in('branch_id', branchIds);
    const userIds = [...new Set((ubs ?? []).map((u) => u.user_id as string))];
    let profileById = new Map<string, Profile>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('erp_profiles')
        .select('*')
        .in('id', userIds);
      profileById = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));
    }
    const branchById = new Map(branchList.map((b) => [b.id, b]));
    members = (ubs ?? []).map((u) => ({
      userId: u.user_id as string,
      branchId: u.branch_id as string,
      branchName:
        branchById.get(u.branch_id as string)?.name_ar ||
        branchById.get(u.branch_id as string)?.name ||
        '',
      role: u.role as string,
      isDefault: u.is_default as boolean,
      fullName: profileById.get(u.user_id as string)?.full_name ?? null,
      email: profileById.get(u.user_id as string)?.email ?? null,
    }));
  }

  // Per-company roles & permissions config.
  const [{ data: rolesData }, { data: companyRolesData }, { data: companyPermsData }] =
    await Promise.all([
      supabase.from('erp_roles').select('key, name_ar, is_system, rank').order('rank', { ascending: false }),
      supabase.from('erp_company_roles').select('role_key, enabled').eq('company_id', id),
      supabase.from('erp_company_role_permissions').select('role_key, permission').eq('company_id', id),
    ]);

  const roles = (rolesData as CompanyRoleRow[]) ?? [];
  const enabledRoles = (companyRolesData ?? [])
    .filter((r) => r.enabled)
    .map((r) => r.role_key as string);
  const permsByRole: Record<string, string[]> = {};
  for (const rp of companyPermsData ?? []) {
    (permsByRole[rp.role_key as string] ??= []).push(rp.permission as string);
  }
  const roleNameByKey = new Map(roles.map((r) => [r.key, r.name_ar]));
  const companyRoleOptions = enabledRoles.map((key) => ({
    key,
    name_ar: roleNameByKey.get(key) ?? key,
  }));

  // Plans, plan→module map, the company's enabled modules & current usage.
  const [{ data: plansData }, { data: planModData }, { data: companyModData }, usage] = await Promise.all([
    supabase.from('erp_plans').select('key, name_ar, max_users, max_branches, max_products, rank').order('rank', { ascending: true }),
    supabase.from('erp_plan_modules').select('plan_key, module'),
    supabase.from('erp_company_modules').select('module, enabled').eq('company_id', id),
    getCompanyUsage(supabase, id),
  ]);
  const plans = (plansData as Plan[]) ?? [];
  const modulesByPlan: Record<string, string[]> = {};
  for (const pm of planModData ?? []) {
    (modulesByPlan[pm.plan_key as string] ??= []).push(pm.module as string);
  }
  const enabledModules = (companyModData ?? [])
    .filter((m) => m.enabled)
    .map((m) => m.module as string);

  // Per-tab data: integration connections / API keys, and the audit trail.
  let integrations: IntegrationRow[] = [];
  let apiKeys: ApiKeyRow[] = [];
  if (tab === 'integrations') {
    const [{ data: ints }, { data: keys }] = await Promise.all([
      supabase.from('erp_integrations').select('id, name, kind, direction, adapter, is_active').eq('company_id', id).order('created_at', { ascending: true }),
      supabase.from('erp_api_keys').select('id, name, prefix, is_active').eq('company_id', id).order('created_at', { ascending: true }),
    ]);
    integrations = (ints as IntegrationRow[]) ?? [];
    apiKeys = (keys as ApiKeyRow[]) ?? [];
  }

  let auditRows: CompanyAuditRow[] = [];
  if (tab === 'audit') {
    const { data: logs } = await supabase
      .from('erp_audit_logs')
      .select('id, actor_email, action, entity, entity_id, created_at')
      .eq('company_id', id)
      .order('created_at', { ascending: false })
      .limit(100);
    auditRows = (logs as CompanyAuditRow[]) ?? [];
  }

  const tabLabels = {
    overview: t('platform.company.tabs.overview'),
    subscription: t('platform.company.tabs.subscription'),
    users: t('platform.company.tabs.users'),
    roles: t('platform.company.tabs.roles'),
    permissions: t('platform.company.tabs.permissions'),
    modules: t('platform.company.tabs.modules'),
    packs: t('platform.company.tabs.packs'),
    integrations: t('platform.company.tabs.integrations'),
    audit: t('platform.company.tabs.audit'),
  } satisfies Record<CompanyTabKey, string>;

  return (
    <div>
      <PageHeader
        title={(company as Company).name_ar || (company as Company).name}
        description={t('platform.company.description')}
      />
      <CompanyTabs id={id} active={tab} labels={tabLabels} />

      {tab === 'roles' || tab === 'permissions' ? (
        <CompanyPermissions
          companyId={id}
          roles={roles}
          enabledRoles={enabledRoles}
          permsByRole={permsByRole}
          view={tab}
        />
      ) : tab === 'audit' ? (
        <CompanyAudit
          rows={auditRows}
          locale={locale}
          labels={{
            empty: t('platform.company.audit.empty'),
            time: t('platform.company.audit.time'),
            actor: t('platform.company.audit.actor'),
            action: t('platform.company.audit.action'),
            entity: t('platform.company.audit.entity'),
          }}
        />
      ) : (
        <CompanyDetail
          tab={tab}
          company={company as Company}
          branches={branchList}
          members={members}
          companyRoles={companyRoleOptions}
          plans={plans}
          usage={usage}
          modulesByPlan={modulesByPlan}
          enabledModules={enabledModules}
          integrations={integrations}
          apiKeys={apiKeys}
        />
      )}
    </div>
  );
}
