import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsSubnav } from '@/components/shared/settings-subnav';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listSync } from './actions';
import { SyncManager } from './sync-manager';

/** Sync Engine — scheduled pull/push jobs on a connection (Phase 2C-2). Gated on
 *  integrations.manage; a Vercel-Cron-triggered Node dispatcher executes jobs. */
export default async function SyncPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('integrations.sync.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.branches.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  const res = await listSync();
  return (
    <div>
      <SettingsSubnav
        backLabel={t('related.backToSettings')}
        relatedLabel={t('related.title')}
        related={[{ href: '/settings/integrations/connections', label: t('settingsHome.connections') }]}
      />
      <PageHeader title={t('integrations.sync.title')} description={t('integrations.sync.subtitle')} />
      <SyncManager
        initialJobs={res.data?.jobs ?? []}
        initialRuns={res.data?.runs ?? []}
        connections={res.data?.connections ?? []}
      />
    </div>
  );
}
