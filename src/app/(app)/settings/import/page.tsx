import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { listImportableEntities } from '@/lib/erp/entities';
import { ImportWizard, type ImportEntity, type ImportJobRow } from './import-wizard';

/** ── Generic Import Engine page ────────────────────────────────────────────
 *  Server component: guards access, loads importable entity descriptors and the
 *  recent import history, then hands off to the client wizard. Multi-tenancy and
 *  the integrations.manage permission are enforced here and again server-side in
 *  the import actions. */
export default async function ImportPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('import.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('settings.branches.superAdminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const importableEntities: ImportEntity[] = listImportableEntities().map((e) => ({
    key: e.key,
    labelAr: e.labelAr,
    labelEn: e.labelEn,
    fields: (e.fields ?? []).map((f) => ({
      key: f.key,
      labelAr: f.labelAr,
      labelEn: f.labelEn,
      type: f.type,
      required: f.required,
    })),
  }));

  const supabase = await createClient();
  const { data: history } = await supabase
    .from('erp_import_jobs')
    .select(
      'id, target_entity, file_name, status, total_rows, success_rows, failed_rows, created_at, completed_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div>
      <PageHeader title={t('import.title')} description={t('import.subtitle')} />
      <ImportWizard
        importableEntities={importableEntities}
        history={(history as ImportJobRow[]) ?? []}
      />
    </div>
  );
}
