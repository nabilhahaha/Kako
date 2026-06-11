import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { getAllActionPolicies } from '@/lib/erp/action-policy';
import { CRITICAL_ACTIONS_BY_KEY } from '@/lib/erp/critical-actions-catalog';
import { ActionPoliciesManager, type PolicyView } from './action-policies-manager';

export const dynamic = 'force-dynamic';

/**
 * Critical-Action Policies — tenant governance console. Company-Admin /
 * Platform-Owner only; lets a tenant override the catalog defaults (risk, reason,
 * approval, notify/escalation targets, reversal, enable/disable, effective date).
 */
export default async function ActionPoliciesPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const resolved = await getAllActionPolicies(supabase, ctx.companyId);

  const policies: PolicyView[] = resolved.map((p) => {
    const spec = CRITICAL_ACTIONS_BY_KEY[p.actionKey];
    return {
      actionKey: p.actionKey,
      domain: spec?.domain ?? 'sales',
      labelKey: spec?.labelKey ?? p.actionKey,
      status: spec?.status ?? 'planned',
      enabled: p.enabled,
      risk: p.risk,
      reasonRequired: p.reasonRequired,
      approvalRequired: p.approvalRequired,
      notifyTargets: p.notifyTargets,
      escalationTargets: p.escalationTargets,
      reversalAllowed: p.reversalAllowed,
      reversalPolicy: p.reversalPolicy,
      effectiveFrom: p.effectiveFrom,
      source: p.source,
    };
  });

  return (
    <div>
      <PageHeader title={t('actionPolicies.title')} description={t('actionPolicies.description')} />
      <ActionPoliciesManager policies={policies} locale={locale} />
    </div>
  );
}
