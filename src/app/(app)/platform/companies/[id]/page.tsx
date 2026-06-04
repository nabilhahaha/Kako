import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Company, Profile } from '@/lib/erp/types';
import { type MemberRow, type IntegrationRow, type ApiKeyRow } from './company-detail';
import { type CompanyRoleRow } from './company-permissions';
import { type CompanyAuditRow } from './company-audit';
import { Company360, type TimelineRow } from './company-360';
import { tabToSection } from './company-360-section';
import { getCompanyUsage, type Plan } from '@/lib/erp/plans';
import { ALL_MODULES } from '@/lib/erp/navigation';
import { describeAuditEvent, AUDIT_DESTRUCTIVE_ACTIONS, type AuditEventLike } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';

/** Audit actions/entities that are "important" enough for the company timeline. */
const IMPORTANT_TIMELINE_ENTITIES = new Set([
  'subscription', 'plan', 'company', 'role', 'role_permission',
  'company_role', 'company_role_permission', 'user', 'user_flags',
]);
const IMPORTANT_TIMELINE_ACTIONS = new Set([
  'renew', 'plan_change', 'activate', 'deactivate', 'enable', 'disable',
  'grant', 'revoke', 'create', 'delete',
]);

async function safeCount(
  fn: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const { count, error } = await fn();
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function safeRows<T>(
  fn: () => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  try {
    const { data, error } = await fn();
    if (error) return null;
    return data ?? [];
  } catch {
    return null;
  }
}

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

  // Integration connections / API keys for this company (read-only).
  const [{ data: ints }, { data: keys }] = await Promise.all([
    supabase.from('erp_integrations').select('id, name, kind, direction, adapter, is_active').eq('company_id', id).order('created_at', { ascending: true }),
    supabase.from('erp_api_keys').select('id, name, prefix, is_active').eq('company_id', id).order('created_at', { ascending: true }),
  ]);
  const integrations = (ints as IntegrationRow[]) ?? [];
  const apiKeys = (keys as ApiKeyRow[]) ?? [];

  // Audit trail (verified erp_audit_logs, migration 0024) scoped to this company.
  const { data: logs } = await supabase
    .from('erp_audit_logs')
    .select('id, actor_email, action, entity, entity_id, details, created_at, company_id')
    .eq('company_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  const auditLogRows =
    (logs as (CompanyAuditRow & { details: Record<string, unknown> | null; company_id: string | null })[]) ?? [];
  const auditRows: CompanyAuditRow[] = auditLogRows.map(({ id: rid, actor_email, action, entity, entity_id, created_at }) => ({
    id: rid, actor_email, action, entity, entity_id, created_at,
  }));

  // ── Extra read-only signals for the KPI strip + Health score ────────────────
  // erp_integrations / erp_sync_runs (verified 0093 / 0094); erp_workflow_tasks
  // (verified 0088). Each degrades to null → the helper applies a neutral default.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const companyName = (company as Company).name_ar || (company as Company).name;
  const [integrationConnections, failedSyncRuns, pendingApprovals] = await Promise.all([
    safeCount(() =>
      supabase
        .from('erp_integrations')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', id)
        .eq('is_active', true)
        .is('revoked_at', null),
    ),
    safeCount(() =>
      supabase
        .from('erp_sync_runs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', id)
        .eq('status', 'failed')
        .gte('started_at', sevenDaysAgo),
    ),
    safeCount(() =>
      supabase
        .from('erp_workflow_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', id)
        .eq('status', 'pending'),
    ),
  ]);

  // Last-activity (most recent audit event) → days since, for the health score.
  const lastActivityIso = auditLogRows[0]?.created_at ?? null;
  const daysSinceLastActivity =
    lastActivityIso != null
      ? Math.max(0, Math.round((Date.now() - new Date(lastActivityIso).getTime()) / 86_400_000))
      : null;

  // Distinct active users (with ≥1 branch assignment) vs total users seen.
  const distinctUsers = new Set(members.map((m) => m.userId));
  const activeUsers = distinctUsers.size;
  const totalUsers = distinctUsers.size;

  // Curated timeline — important company events, newest-first.
  const timeline: TimelineRow[] = auditLogRows
    .filter(
      (r) =>
        IMPORTANT_TIMELINE_ENTITIES.has(r.entity) ||
        IMPORTANT_TIMELINE_ACTIONS.has(r.action),
    )
    .slice(0, 12)
    .map((r) => ({
      id: r.id,
      created_at: r.created_at,
      sentence: describeAuditEvent(r as AuditEventLike, { locale, companyName }),
      destructive: AUDIT_DESTRUCTIVE_ACTIONS.has(r.action),
    }));

  return (
    <div>
      <PageHeader title={companyName} description={t('platform.company.description')} />
      <Company360
        initialSection={tabToSection(rawTab)}
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
        roles={roles}
        enabledRoles={enabledRoles}
        permsByRole={permsByRole}
        auditRows={auditRows}
        timeline={timeline}
        activeUsers={activeUsers}
        totalUsers={totalUsers}
        modulesTotal={ALL_MODULES.length}
        integrationConnections={integrationConnections}
        failedSyncRuns={failedSyncRuns}
        pendingApprovals={pendingApprovals}
        daysSinceLastActivity={daysSinceLastActivity}
      />
    </div>
  );
}
