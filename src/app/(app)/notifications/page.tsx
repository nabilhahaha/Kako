import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { NotificationsManager, type NotificationRow } from './notifications-manager';
import { DEFAULT_PAGE_SIZE, param, pageNumber, rangeFor, type SearchParams } from '@/lib/list-params';

/** ── In-app Notification Center ────────────────────────────────────────────
 *  Lists the current user's notifications (RLS-scoped). Engine + workflow events
 *  write here; in-app only for now (channel column is the extension point).
 *
 *  Phase-5: server-side filter / search / paginate from `searchParams` so the
 *  view is shareable, refresh-safe and deep-linkable. Unread notifications are
 *  ordered first (T1 attention); read rows stay visible but muted. */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const sp = (await searchParams) ?? {};
  const page = pageNumber(sp);
  const pageSize = DEFAULT_PAGE_SIZE;
  const q = (param(sp, 'q') ?? '').trim();
  const type = param(sp, 'type') ?? 'all';
  const unreadOnly = param(sp, 'unread') === '1';

  const supabase = await createClient();

  let query = supabase
    .from('erp_notifications')
    .select('id, type, title_ar, title_en, body, link, entity, record_id, is_read, created_at', { count: 'exact' })
    // Unread first (T1), then newest first.
    .order('is_read', { ascending: true })
    .order('created_at', { ascending: false });

  if (type !== 'all') query = query.eq('type', type);
  if (unreadOnly) query = query.eq('is_read', false);
  if (q) {
    const like = `%${q}%`;
    query = query.or(`title_ar.ilike.${like},title_en.ilike.${like},body.ilike.${like}`);
  }

  const [from, to] = rangeFor(page, pageSize);
  const [{ data, count }, unreadRes, distinctRes] = await Promise.all([
    query.range(from, to),
    // Total unread for the prominent header count (independent of filters).
    supabase
      .from('erp_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),
    // Distinct `type` values for the filter, from a bounded recent window.
    supabase
      .from('erp_notifications')
      .select('type')
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const rows = (data as NotificationRow[]) ?? [];
  const total = count ?? rows.length;
  const unreadTotal = unreadRes.count ?? 0;
  const typeOptions = Array.from(
    new Set(((distinctRes.data as { type: string }[]) ?? []).map((r) => r.type).filter(Boolean)),
  ).sort();

  return (
    <div>
      <PageHeader title={t('notifications.title')} description={t('notifications.subtitle')} />
      <Suspense fallback={null}>
        <NotificationsManager
          notifications={rows}
          total={total}
          unreadTotal={unreadTotal}
          page={page}
          pageSize={pageSize}
          filters={{ q, type, unreadOnly }}
          typeOptions={typeOptions}
        />
      </Suspense>
    </div>
  );
}
