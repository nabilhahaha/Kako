import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, AlertTriangle, XCircle, Layers, CheckCircle2 } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getEntity } from '@/lib/erp/entities';
import { summarizeValidationIssues, type ValidationJobLike } from '@/lib/erp/import-validation';

// Validation Dashboard — aggregates per-row issues recorded in
// erp_import_jobs.error_log across recent imports. Read-only; no new tables.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function ValidationDashboardPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'integrations.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();

  const jobs = await safe(async () => {
    const { data } = await supabase
      .from('erp_import_jobs')
      .select('target_entity, error_log')
      .order('created_at', { ascending: false })
      .limit(200);
    return (data ?? []) as ValidationJobLike[];
  }, []);

  const summary = summarizeValidationIssues(jobs);
  const label = (key: string) => {
    const e = getEntity(key);
    return e ? (locale === 'ar' ? e.labelAr : e.labelEn) : key;
  };
  const hasIssues = summary.totalErrors + summary.totalWarnings > 0;

  return (
    <div className="space-y-6">
      <Link href="/settings/onboarding" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('onboarding.title')}
      </Link>
      <PageHeader title={t('onboarding.validation.title')} description={t('onboarding.validation.subtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('onboarding.validation.errors')} value={String(summary.totalErrors)} icon={XCircle} tone={summary.totalErrors > 0 ? 'destructive' : 'success'} />
        <StatCard label={t('onboarding.validation.warnings')} value={String(summary.totalWarnings)} icon={AlertTriangle} tone={summary.totalWarnings > 0 ? 'warning' : 'success'} />
        <StatCard label={t('onboarding.validation.jobsAffected')} value={String(summary.jobsWithIssues)} icon={Layers} tone="info" />
      </div>

      {!hasIssues ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-success">
            <CheckCircle2 className="h-5 w-5" /> {t('onboarding.validation.clean')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* By entity */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t('onboarding.validation.byEntity')}</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">{t('onboarding.validation.entityCol')}</th>
                    <th className="px-4 py-2 text-end font-medium">{t('onboarding.validation.errorsCol')}</th>
                    <th className="px-4 py-2 text-end font-medium">{t('onboarding.validation.warningsCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byEntity.map((e) => (
                    <tr key={e.entityKey} className="border-t">
                      <td className="px-4 py-2">{label(e.entityKey)}</td>
                      <td className="px-4 py-2 text-end text-destructive tabular-nums">{e.errors}</td>
                      <td className="px-4 py-2 text-end text-warning tabular-nums">{e.warnings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top messages */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t('onboarding.validation.topMessages')}</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">{t('onboarding.validation.msgCol')}</th>
                    <th className="px-4 py-2 text-end font-medium">{t('onboarding.validation.countCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topMessages.map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2">
                        <Badge variant={m.severity === 'error' ? 'destructive' : 'warning'} className="me-2">
                          {t(`import.severity.${m.severity}`)}
                        </Badge>
                        {m.message}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
