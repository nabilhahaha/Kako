'use client';

import { useI18n } from '@/lib/i18n/provider';
import { EntityTabs } from '@/components/admin/entity-detail';
import { useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { ConnectionsManager } from './connections/connections-manager';
import { ApiKeysManager } from './api-keys/api-keys-manager';
import { WebhooksManager } from './webhooks/webhooks-manager';
import { SyncManager } from './sync/sync-manager';
import type { ConnectionRow } from './connections/actions';
import type { ApiKeyRow } from './api-keys/actions';
import type { WebhookRow, DeliveryRow } from './webhooks/actions';
import type { SyncJobRow, SyncRunRow, ConnectionOption } from './sync/actions';

/**
 * Integrations Workbench — the integration sub-areas (Connections · API Keys ·
 * Webhooks · Sync) consolidated under one URL-addressable tab bar, each rendering
 * the existing manager verbatim. Reduced navigation loss; no business-logic /
 * permission / RLS / workflow change.
 */
export function IntegrationsWorkbench({
  connections, apiKeys, webhooks, deliveries, syncJobs, syncRuns, syncConnections,
}: {
  connections: ConnectionRow[];
  apiKeys: ApiKeyRow[];
  webhooks: WebhookRow[];
  deliveries: DeliveryRow[];
  syncJobs: SyncJobRow[];
  syncRuns: SyncRunRow[];
  syncConnections: ConnectionOption[];
}) {
  const { t } = useI18n();
  const { tab, setTab } = useWorkbenchSelection('connections');

  return (
    <div>
      <EntityTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'connections', label: t('adminWb.tabConnections') },
          { key: 'api-keys', label: t('adminWb.tabApiKeys') },
          { key: 'webhooks', label: t('adminWb.tabWebhooks') },
          { key: 'sync', label: t('adminWb.tabSync') },
        ]}
      />
      {tab === 'connections' && <ConnectionsManager initialConnections={connections} />}
      {tab === 'api-keys' && <ApiKeysManager initialKeys={apiKeys} />}
      {tab === 'webhooks' && <WebhooksManager initialHooks={webhooks} initialDeliveries={deliveries} />}
      {tab === 'sync' && <SyncManager initialJobs={syncJobs} initialRuns={syncRuns} connections={syncConnections} />}
    </div>
  );
}
