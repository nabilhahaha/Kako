import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsSubnav } from '@/components/shared/settings-subnav';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listConnections } from './actions';
import { ConnectionsManager } from './connections-manager';

/** External Connections — connector framework + connection store (Phase 2C-1).
 *  Gated on integrations.manage; credentials stored in Supabase Vault via guarded
 *  RPCs. Live pull/push transport arrives with the Sync Engine (2C-2). */
export default async function ConnectionsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('integrations.connections.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.branches.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  const res = await listConnections();
  return (
    <div>
      <SettingsSubnav
        backLabel={t('related.backToSettings')}
        relatedLabel={t('related.title')}
        related={[{ href: '/settings/integrations/sync', label: t('settingsHome.sync') }]}
      />
      <PageHeader title={t('integrations.connections.title')} description={t('integrations.connections.subtitle')} />
      <ConnectionsManager initialConnections={res.data ?? []} />
    </div>
  );
}
