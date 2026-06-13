import { redirect } from 'next/navigation';
import { ClipboardCheck, MapPin, CreditCard, Users, ListChecks } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { ApprovalsTabs } from '../approvals/approvals-tabs';
import { AttentionList, QuickNav, type QuickLink } from '@/components/home/home-widgets';
import { nextBestActions, type AttentionItem } from '@/app/(app)/copilot/actions';
import { rankAttention } from '@/lib/erp/attention';

// Approval Center — consolidated view of everything awaiting approval, plus
// fast paths to each approval queue. Reuses the RLS-scoped nextBestActions
// (which already surfaces pending visits/day-close/transfers/workflow) and the
// existing queue screens; no new data path.

const APPROVAL_HREFS = new Set(['/approvals', '/distribution/journey-compliance', '/distribution/credit-requests', '/customers']);

export default async function ApprovalCenterPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();

  const itemsRes = await nextBestActions(locale);
  const all = itemsRes.ok && itemsRes.data ? itemsRes.data : [];
  // Focus on approval-relevant items (pending queues); fall back to all if none tagged.
  const approvalItems: AttentionItem[] = rankAttention(all.filter((i) => APPROVAL_HREFS.has(i.href)));
  const pending = approvalItems.reduce((n, i) => n + i.count, 0);

  const quick: QuickLink[] = [
    { label: t('nav.items.approvals'), href: '/approvals', icon: ClipboardCheck },
    { label: t('nav.items.journeyCompliance'), href: '/distribution/journey-compliance', icon: MapPin },
    { label: t('nav.items.creditRequests'), href: '/distribution/credit-requests', icon: CreditCard },
    { label: t('nav.items.customers'), href: '/customers', icon: Users },
  ];

  return (
    <div className="space-y-6">
      <ApprovalsTabs showWorkflow />
      <PageHeader title={t('home.approvalsTitle')} description={t('home.approvalsSubtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('home.items')} value={String(approvalItems.length)} icon={ListChecks} tone="info" />
        <StatCard label={t('home.urgent')} value={String(pending)} icon={ClipboardCheck} tone={pending > 0 ? 'warning' : 'success'} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.needsYouNow')}</h2>
        <AttentionList items={approvalItems} openLabel={t('home.open')} emptyTitle={t('home.emptyAttention')} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.quickNav')}</h2>
        <QuickNav links={quick} />
      </section>
    </div>
  );
}
