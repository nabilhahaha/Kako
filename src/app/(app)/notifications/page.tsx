import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { NotificationsManager, type NotificationRow } from './notifications-manager';

/** ── In-app Notification Center ────────────────────────────────────────────
 *  Lists the current user's notifications (RLS-scoped). Engine + workflow events
 *  write here; in-app only for now (channel column is the extension point). */
export default async function NotificationsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_notifications')
    .select('id, type, title_ar, title_en, body, link, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHeader title={t('notifications.title')} description={t('notifications.subtitle')} />
      <NotificationsManager notifications={(data as NotificationRow[]) ?? []} />
    </div>
  );
}
