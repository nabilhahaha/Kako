import Link from 'next/link';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { listImportableEntities } from '@/lib/erp/entities';
import { FileSpreadsheet, PencilLine, Upload } from 'lucide-react';

/** ── Data Onboarding Center ────────────────────────────────────────────────
 *  Landing under "Data Import & Integrations". Lists the importable FMCG
 *  entities (each linking to the existing Import Engine wizard + a manual-entry
 *  form) and shows recent import history. Reuses the import engine — no parsing
 *  or validation is reimplemented here. */

// FMCG onboarding entities (subset of the registry) → their manual-entry routes.
const FMCG_KEYS = ['customer', 'product', 'user', 'route', 'journey_plan'] as const;
const MANUAL_ROUTE: Record<string, string> = {
  customer: '/customers',
  product: '/products',
  user: '/settings/staff',
  route: '/distribution/routes',
  journey_plan: '/sales/journey',
};

interface JobRow {
  id: string;
  target_entity: string;
  file_name: string | null;
  status: string | null;
  total_rows: number | null;
  success_rows: number | null;
  failed_rows: number | null;
  created_at: string;
}

export default async function DataOnboardingPage() {
  await requireNonRetailAdmin();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();

  if (!hasPermission(ctx, 'integrations.manage')) {
    return (
      <div>
        <PageHeader title={t('fmcg.onboardingTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('fmcg.notPermitted')}</CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();

  const importable = listImportableEntities();
  const byKey = new Map(importable.map((e) => [e.key, e]));
  const entities = FMCG_KEYS.map((k) => byKey.get(k)).filter(Boolean) as typeof importable;

  const { data: history } = await supabase
    .from('erp_import_jobs')
    .select('id, target_entity, file_name, status, total_rows, success_rows, failed_rows, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  const jobs = (history as JobRow[]) ?? [];

  const entLabel = (e: { key: string; labelAr: string; labelEn: string }) =>
    locale === 'ar' ? e.labelAr : e.labelEn;
  const entLabelByKey = (key: string) => {
    const e = byKey.get(key);
    return e ? entLabel(e) : key;
  };

  const statusBadge = (status: string | null) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">{t('fmcg.statusCompleted')}</Badge>;
      case 'failed':
        return <Badge variant="destructive">{t('fmcg.statusFailed')}</Badge>;
      case 'processing':
        return <Badge variant="info">{t('fmcg.statusProcessing')}</Badge>;
      default:
        return <Badge variant="secondary">{t('fmcg.statusPending')}</Badge>;
    }
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString(INTL_LOCALE[locale], { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div>
      <PageHeader title={t('fmcg.onboardingTitle')} description={t('fmcg.onboardingDescription')} />

      {/* Importable entities */}
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('fmcg.onboardingEntities')}</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entities.map((e) => (
          <Card key={e.key}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">{entLabel(e)}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Link href={`/settings/import?entity=${e.key}`}>
                  <span className="inline-flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    <Upload className="h-4 w-4" /> {t('fmcg.importViaWizard')}
                  </span>
                </Link>
                {MANUAL_ROUTE[e.key] && (
                  <Link href={MANUAL_ROUTE[e.key]}>
                    <span className="inline-flex w-full items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-secondary">
                      <PencilLine className="h-4 w-4" /> {t('fmcg.manualEntry')}
                    </span>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Import history */}
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('fmcg.importHistory')}</h2>
      <Card>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('fmcg.historyEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('fmcg.historyFile')}</th>
                    <th className="p-3 text-start font-medium">{t('fmcg.historyEntity')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.historyStatus')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.historyTotal')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.historySuccess')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.historyFailed')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.historyDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b">
                      <td className="p-3 font-medium">{j.file_name || '—'}</td>
                      <td className="p-3">{entLabelByKey(j.target_entity)}</td>
                      <td className="p-3 text-center">{statusBadge(j.status)}</td>
                      <td className="p-3 text-center tabular-nums">{j.total_rows ?? 0}</td>
                      <td className="p-3 text-center tabular-nums text-success">{j.success_rows ?? 0}</td>
                      <td className="p-3 text-center tabular-nums text-destructive">{j.failed_rows ?? 0}</td>
                      <td className="p-3 text-center text-muted-foreground" dir="ltr">{fmtDate(j.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
