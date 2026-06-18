import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ModulePage } from '@/components/admin/module-page';
import { TopGroupingNav } from '@/components/admin/top-grouping-nav';
import { listImportableEntities, listExportableEntities } from '@/lib/erp/entities';
import { listSourcePresets } from '@/lib/erp/onboarding-sources';
import { ImportWizard, type ImportEntity, type ImportJobRow } from './import-wizard';
import { ExportPanel, type ExportEntity } from '../export/export-panel';

export const dynamic = 'force-dynamic';

/**
 * Data Exchange (M3-C) — one page with Import and Export tabs, each rendering its
 * existing engine verbatim (ImportWizard / ExportPanel) with its own loader.
 * Tabs are URL-addressable (`?tab=`); the Import tab still honours `?entity=` /
 * `?source=`. Both share the `integrations.manage` gate, so tabbing changes no
 * access. Reuse only — no engine/action/RLS change.
 */
type Tab = 'import' | 'export';

export default async function DataExchangePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; entity?: string; source?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('import.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.branches.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};
  const tab: Tab = sp.tab === 'export' ? 'export' : 'import';
  const supabase = await createClient();

  let content: React.ReactNode;
  if (tab === 'export') {
    const exportableEntities: ExportEntity[] = listExportableEntities()
      .filter((e) => !e.permission || hasPermission(ctx, e.permission))
      .map((e) => ({
        key: e.key, labelAr: e.labelAr, labelEn: e.labelEn,
        fields: (e.fields ?? []).map((f) => ({ key: f.key, labelAr: f.labelAr, labelEn: f.labelEn })),
      }));
    content = <ExportPanel entities={exportableEntities} />;
  } else {
    const importable = listImportableEntities();
    const { data: cfRows } = await supabase
      .from('erp_custom_fields')
      .select('entity, key, label_ar, label_en, type, required, sort')
      .in('entity', importable.map((e) => e.key))
      .eq('is_active', true)
      .order('sort', { ascending: true });
    const customByEntity = new Map<string, ImportEntity['fields']>();
    for (const r of (cfRows as Record<string, unknown>[]) ?? []) {
      const ent = r.entity as string;
      const ty = r.type as string;
      const mapped = ty === 'number' ? 'number' : ty === 'date' ? 'date' : ty === 'boolean' ? 'boolean' : 'text';
      const list = customByEntity.get(ent) ?? [];
      list.push({
        key: r.key as string, labelAr: r.label_ar as string,
        labelEn: (r.label_en as string) || (r.key as string),
        type: mapped as 'text' | 'number' | 'date' | 'boolean', required: Boolean(r.required),
      });
      customByEntity.set(ent, list);
    }
    const importableEntities: ImportEntity[] = importable.map((e) => ({
      key: e.key, labelAr: e.labelAr, labelEn: e.labelEn,
      fields: [
        ...(e.fields ?? []).map((f) => ({ key: f.key, labelAr: f.labelAr, labelEn: f.labelEn, type: f.type, required: f.required })),
        ...(customByEntity.get(e.key) ?? []),
      ],
    }));
    const { data: history } = await supabase
      .from('erp_import_jobs')
      .select('id, target_entity, file_name, status, total_rows, success_rows, failed_rows, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(50);
    const sources = listSourcePresets().map((p) => ({ key: p.key, labelAr: p.labelAr, labelEn: p.labelEn }));
    const initialEntity = sp.entity && importableEntities.some((e) => e.key === sp.entity) ? sp.entity : undefined;
    const initialSource = sp.source && sources.some((s) => s.key === sp.source) ? sp.source : undefined;
    content = (
      <ImportWizard
        importableEntities={importableEntities}
        history={(history as ImportJobRow[]) ?? []}
        sources={sources}
        initialEntity={initialEntity}
        initialSource={initialSource}
      />
    );
  }

  const tabs = [
    { key: 'import', label: t('import.title'), href: '/settings/import?tab=import', active: tab === 'import' },
    { key: 'export', label: t('dataExport.title'), href: '/settings/import?tab=export', active: tab === 'export' },
  ];

  return (
    <ModulePage nav={<TopGroupingNav items={tabs} ariaLabel={t('import.title')} />}>
      {content}
    </ModulePage>
  );
}
