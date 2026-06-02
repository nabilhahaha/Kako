import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listApiKeys } from './actions';
import { ApiKeysManager } from './api-keys-manager';

/** API Keys — per-company keys for the inbound REST API (/api/v1). Phase 2A.
 *  Gated on integrations.manage; keys are created/revoked via guarded RPCs. */
export default async function ApiKeysPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('integrations.apiKeys.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.branches.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  const res = await listApiKeys();
  return (
    <div>
      <PageHeader title={t('integrations.apiKeys.title')} description={t('integrations.apiKeys.subtitle')} />
      <ApiKeysManager initialKeys={res.data ?? []} />
    </div>
  );
}
