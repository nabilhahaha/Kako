import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listWebhooks } from './actions';
import { WebhooksManager } from './webhooks-manager';

/** Outbound Webhooks — per-company event subscriptions (Phase 2B). Gated on
 *  integrations.manage; create/revoke/test via guarded RPCs; delivery is
 *  HMAC-signed and driven by pg_cron + pg_net. */
export default async function WebhooksPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('integrations.webhooks.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.branches.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  const res = await listWebhooks();
  return (
    <div>
      <PageHeader title={t('integrations.webhooks.title')} description={t('integrations.webhooks.subtitle')} />
      <WebhooksManager initialHooks={res.data?.hooks ?? []} initialDeliveries={res.data?.deliveries ?? []} />
    </div>
  );
}
