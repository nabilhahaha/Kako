import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ALERTS_ENABLED } from '@/lib/alerts';
import { loadAlerts } from '@/lib/alerts/list-server';
import { AlertsList } from './alerts-list';

export const dynamic = 'force-dynamic';

// Critical Alerts — list + lifecycle (metadata-driven). RLS-scoped. Flag-gated.
export default async function AlertsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ALERTS_ENABLED()) notFound();

  const { t } = await getT();
  const supabase = await createClient();
  const rows = await loadAlerts(supabase);

  return (
    <div className="space-y-6">
      <PageHeader title={t('alertsUi.title')} description={t('alertsUi.subtitle')} />
      {rows.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('alertsUi.none')}</CardContent></Card>
      ) : (
        <AlertsList rows={rows} />
      )}
    </div>
  );
}
