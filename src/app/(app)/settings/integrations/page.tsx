import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listConnections } from './connections/actions';
import { listApiKeys } from './api-keys/actions';
import { listWebhooks } from './webhooks/actions';
import { listSync } from './sync/actions';
import { IntegrationsWorkbench } from './integrations-workbench';

export const dynamic = 'force-dynamic';

/**
 * Integrations — the integration sub-areas (Connections · API Keys · Webhooks ·
 * Sync) consolidated into one workbench, each tab reusing its existing manager
 * verbatim. Gated on integrations.manage. UX standardization only — no
 * business-logic / permission / RLS / workflow change.
 */
export default async function IntegrationsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('integrations.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.branches.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  const [conns, keys, hooks, sync] = await Promise.all([
    listConnections(), listApiKeys(), listWebhooks(), listSync(),
  ]);

  return (
    <div>
      <PageHeader title={t('integrations.title')} description={t('integrations.description')} />
      <IntegrationsWorkbench
        connections={conns.ok ? (conns.data ?? []) : []}
        apiKeys={keys.ok ? (keys.data ?? []) : []}
        webhooks={hooks.ok ? (hooks.data?.hooks ?? []) : []}
        deliveries={hooks.ok ? (hooks.data?.deliveries ?? []) : []}
        syncJobs={sync.ok ? (sync.data?.jobs ?? []) : []}
        syncRuns={sync.ok ? (sync.data?.runs ?? []) : []}
        syncConnections={sync.ok ? (sync.data?.connections ?? []) : []}
      />
    </div>
  );
}
