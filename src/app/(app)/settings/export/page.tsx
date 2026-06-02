import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listExportableEntities } from '@/lib/erp/entities';
import { ExportPanel, type ExportEntity } from './export-panel';

/** ── Generic Export Engine page ───────────────────────────────────────────
 *  Server component: guards access (integrations.manage), lists exportable
 *  entities — filtered to the ones the user is permitted to read — then hands
 *  off to the client panel. The actual download is a permission-checked,
 *  company-scoped route handler (/api/export). No entity-specific screens. */
export default async function ExportPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('dataExport.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('settings.branches.superAdminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const exportableEntities: ExportEntity[] = listExportableEntities()
    .filter((e) => !e.permission || hasPermission(ctx, e.permission))
    .map((e) => ({
      key: e.key,
      labelAr: e.labelAr,
      labelEn: e.labelEn,
      fields: (e.fields ?? []).map((f) => ({ key: f.key, labelAr: f.labelAr, labelEn: f.labelEn })),
    }));

  return (
    <div>
      <PageHeader title={t('dataExport.title')} description={t('dataExport.subtitle')} />
      <ExportPanel entities={exportableEntities} />
    </div>
  );
}
