import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { returnApprovalEnabled } from '@/lib/van-sales/return-policy';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { ReturnPolicyManager, type PolicyView, type RuleView, type RefItem } from './return-policy-manager';

export const dynamic = 'force-dynamic';

/**
 * Return Approval policy console (Company-Admin / Platform-Owner). Configure the
 * MODE (disabled / open / approval), the default primary + backup approver, and an
 * ordered list of RULES (type · value band · customer · class · salesman · route ·
 * category → auto / approval / block, with optional per-rule approver + backup).
 * This is the company-policy layer of the platform-capability → policy → permission
 * model; the pure resolver reads exactly this data. Nothing hardcoded.
 */
export default async function ReturnSettingsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'settings.workflow_policy')) redirect('/dashboard');

  const supabase = await createClient();
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;

  const [{ data: polRow }, { data: ruleRows }, { data: custRows }, { data: routeRows }, { data: catRows }] = await Promise.all([
    supabase.from('erp_return_approval_policies').select('mode, approver_role, backup_approver_role').eq('company_id', ctx.companyId ?? '').maybeSingle(),
    supabase.from('erp_return_approval_rules').select('*').eq('company_id', ctx.companyId ?? '').order('priority'),
    supabase.from('erp_customers').select('id, name, code').order('name').limit(1000),
    supabase.from('erp_routes').select('id, name').order('name').limit(500),
    supabase.from('erp_product_categories').select('id, name').order('name').limit(500),
  ]);

  // Salesmen for the rule selector: users in the company's branches.
  const { data: branchRows } = await supabase.from('erp_branches').select('id').eq('company_id', ctx.companyId ?? '');
  const branchIds = ((branchRows ?? []) as { id: string }[]).map((b) => b.id);
  let salesmen: RefItem[] = [];
  if (branchIds.length) {
    const { data: ub } = await supabase.from('erp_user_branches').select('user_id').in('branch_id', branchIds);
    const userIds = [...new Set(((ub ?? []) as { user_id: string }[]).map((u) => u.user_id))];
    if (userIds.length) {
      const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', userIds);
      salesmen = ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => ({ id: p.id, name: p.full_name || p.id.slice(0, 8) }));
      salesmen.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  const p = polRow as { mode: string; approver_role: string | null; backup_approver_role: string | null } | null;
  const policy: PolicyView = {
    mode: (p?.mode as PolicyView['mode']) ?? 'open',
    approverRole: (p?.approver_role as PolicyView['approverRole']) ?? 'supervisor',
    backupApproverRole: (p?.backup_approver_role as PolicyView['backupApproverRole']) ?? null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rules: RuleView[] = ((ruleRows ?? []) as any[]).map((r) => ({
    id: r.id, priority: r.priority, active: r.active,
    returnType: r.return_type, minValue: r.min_value, maxValue: r.max_value,
    customerId: r.customer_id, customerClass: r.customer_class, salesmanId: r.salesman_id,
    routeId: r.route_id, productCategoryId: r.product_category_id,
    result: r.result, approverLevel: r.approver_level, backupApproverLevel: r.backup_approver_level,
  }));

  const ref = {
    customers: ((custRows ?? []) as { id: string; name: string; code: string }[]).map((c) => ({ id: c.id, name: `${c.name} · ${c.code}` })),
    routes: ((routeRows ?? []) as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name })),
    categories: ((catRows ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })),
    salesmen,
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('returnPolicy.title')} description={t('returnPolicy.description')} />
      <ReturnPolicyManager policy={policy} rules={rules} ref={ref} flagOn={returnApprovalEnabled(flags)} />
    </div>
  );
}
