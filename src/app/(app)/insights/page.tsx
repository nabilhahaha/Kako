import { redirect } from 'next/navigation';
import { Lightbulb } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { InsightsPanel } from '@/components/home/insights-panel';
import { companyInsights } from '@/app/(app)/insights/actions';

// VANTORA Insights — deterministic "why is this happening / what next" intelligence
// over existing RLS-scoped data. Feature-flagged OFF by default
// (VANTORA_INSIGHTS_ENABLED); no LLM, no data writes.

export default async function InsightsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isPlatformOwner || ctx.isSuperAdmin || hasPermission(ctx, 'reports.view') || ctx.memberships.some((m) => m.role === 'admin' || m.role === 'manager');
  if (!allowed) redirect('/dashboard');

  const { t, locale } = await getT();
  const res = await companyInsights(locale);
  const data = res.ok && res.data ? res.data : { enabled: false, insights: [] };

  return (
    <div className="space-y-6">
      <PageHeader title={t('insights.title')} description={t('insights.subtitle')} />
      {!data.enabled ? (
        <EmptyState icon={<Lightbulb />} title={t('insights.disabled')} description={t('insights.disabledHint')} />
      ) : (
        <InsightsPanel insights={data.insights} emptyTitle={t('insights.empty')} />
      )}
    </div>
  );
}
