import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import Link from 'next/link';
import { Upload, FileSpreadsheet, Plug, KeyRound, Webhook, ScrollText, Clock, ArrowRight } from 'lucide-react';

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
    { icon: KeyRound, key: 'apiKeys', href: '/settings/integrations/api-keys' },
    { icon: Webhook, key: 'webhooks' },
    { icon: ScrollText, key: 'syncLogs' },
  ] as const;

  return (
    <div>
      <PageHeader title={t('integrations.title')} description={t('integrations.description')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => {
          const href = 'href' in a ? (a as { href: string }).href : undefined;
          const inner = (
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <a.icon className="h-5 w-5" />
                </span>
                {href ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    {t('integrations.available')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3 w-3" /> {t('integrations.soon')}
                  </span>
                )}
              </div>
              <h3 className="flex items-center gap-1.5 font-semibold">
                {t(`integrations.areas.${a.key}.t`)}
                {href && <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(`integrations.areas.${a.key}.d`)}</p>
            </CardContent>
          );
          return href ? (
            <Link key={a.key} href={href} className="group rounded-xl transition-colors hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full">{inner}</Card>
            </Link>
          ) : (
            <Card key={a.key}>{inner}</Card>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">{t('integrations.note')}</p>
    </div>
  );
}
