import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { ApprovalsManager } from '../approvals/approvals-manager';
import { RequestTabs, REQUEST_TAB_ORDER, type RequestTabKey } from './request-tabs';
import { RequestList, type RequestListLabels } from './request-list';
import { loadActionableTasks, loadMyRequests, loadRequestHistory } from './data';

/** ── Request & Approval Center ─────────────────────────────────────────────
 *  Unified surface over the generic workflow engine: the approvals inbox, the
 *  requests I submitted, and my completed-request history. URL-param tabs. */
export default async function RequestCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const tab: RequestTabKey = REQUEST_TAB_ORDER.includes(rawTab as RequestTabKey)
    ? (rawTab as RequestTabKey)
    : 'inbox';
  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');
  const supabase = await createClient();

  const tabLabels: Record<RequestTabKey, string> = {
    inbox: t('requests.tabs.inbox'),
    mine: t('requests.tabs.mine'),
    history: t('requests.tabs.history'),
  };

  const statusLabels: Record<string, string> = {
    pending: t('requests.status.pending'),
    approved: t('requests.status.approved'),
    rejected: t('requests.status.rejected'),
    cancelled: t('requests.status.cancelled'),
    escalated: t('requests.status.escalated'),
  };
  const entityLabel = (e: string) => t(`workflow.entity.${e}`) || e;
  const listLabels = (mode: 'mine' | 'history'): RequestListLabels => ({
    empty: mode === 'mine' ? t('requests.mine.empty') : t('requests.history.empty'),
    request: t('requests.col.request'),
    statusHeader: mode === 'history' ? t('requests.col.outcome') : t('requests.col.status'),
    dateHeader: mode === 'history' ? t('requests.col.decided') : t('requests.col.started'),
    stepHeader: t('requests.col.step'),
    step: t('requests.col.step'),
    statusLabels,
    entityLabel,
  });

  return (
    <div>
      <PageHeader title={t('requests.title')} description={t('requests.subtitle')} />
      <RequestTabs active={tab} labels={tabLabels} />
      {tab === 'inbox' ? (
        <ApprovalsManager tasks={await loadActionableTasks(supabase, { userId: ctx.userId, isCompanyAdmin })} />
      ) : tab === 'mine' ? (
        <RequestList rows={await loadMyRequests(supabase, ctx.userId)} mode="mine" locale={locale} labels={listLabels('mine')} />
      ) : (
        <RequestList rows={await loadRequestHistory(supabase, ctx.userId)} mode="history" locale={locale} labels={listLabels('history')} />
      )}
    </div>
  );
}
