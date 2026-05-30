import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { Upload, FileSpreadsheet, Plug, KeyRound, Webhook, ScrollText, Clock } from 'lucide-react';

/** Data Integration Layer — landing/overview. The sub-areas (import, mapping
 *  templates, integrations, API keys, webhooks, sync logs) are on the roadmap
 *  (see docs/INTEGRATION.md); this page is a safe, permission-gated placeholder
 *  that previews them without any live processing. Gated on integrations.manage. */
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

  const areas = [
    { icon: Upload, key: 'dataImport' },
    { icon: FileSpreadsheet, key: 'mappingTemplates' },
    { icon: Plug, key: 'connections' },
    { icon: KeyRound, key: 'apiKeys' },
    { icon: Webhook, key: 'webhooks' },
    { icon: ScrollText, key: 'syncLogs' },
  ] as const;

  return (
    <div>
      <PageHeader title={t('integrations.title')} description={t('integrations.description')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <Card key={a.key}>
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <a.icon className="h-5 w-5" />
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3 w-3" /> {t('integrations.soon')}
                </span>
              </div>
              <h3 className="font-semibold">{t(`integrations.areas.${a.key}.t`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(`integrations.areas.${a.key}.d`)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">{t('integrations.note')}</p>
    </div>
  );
}
