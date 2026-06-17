import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { smartNextCustomerEnabled } from '@/lib/van-sales/sell';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { loadNextCandidates } from '@/lib/van-sales/next-customer-server';
import { SmartNextScreen } from './smart-next-screen';

export const dynamic = 'force-dynamic';

// Smart Next Customer screen. Flag-gated (platform.smart_next_customer, default
// OFF). Reached after Complete Visit (?done=) and at Start Day; suggests today's
// remaining route stops ranked route-first. Falls back to the route when off.
export default async function FieldNextPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  if (!smartNextCustomerEnabled(flags)) redirect('/field/journey');

  const { done } = await searchParams;
  const mode: 'completed' | 'startday' = done ? 'completed' : 'startday';

  const { t } = await getT();
  const res = await loadNextCandidates();
  const candidates = res.ok && res.data ? res.data.candidates : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <BackLink href="/field/journey" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.smartNext.startDayTitle')} />
      <SmartNextScreen candidates={candidates} total={candidates.length} mode={mode} />
    </div>
  );
}
