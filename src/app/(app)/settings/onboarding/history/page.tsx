import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Layers, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { getEntity } from '@/lib/erp/entities';
import { summarizeImportJobs, importHealth, type ImportJobLike } from '@/lib/erp/import-monitor';

// Import History — full job log over erp_import_jobs (RLS-scoped). Read-only.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

const HEALTH_TONE: Record<'good' | 'attention' | 'critical', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive' };
const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  completed: 'success', failed: 'destructive', importing: 'warning', pending: 'warning', validating: 'warning', ready: 'warning', draft: 'secondary',
};

interface JobRow extends ImportJobLike { id: string; target_entity: string | null; file_name: string | null; created_at: string }

export default async function ImportHistoryPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'integrations.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();

  const jobs = await safe(async () => {
    const { data } = await supabase
      .from('erp_import_jobs')
      .select('id, target_entity, file_name, status, total_rows, success_rows, failed_rows, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    return (data ?? []) as JobRow[];
  }, []);

  const summary = summarizeImportJobs(jobs);
  const health = importHealth(summary);
  const label = (key: string | null) => {
    if (!key) return '—';
    const e = getEntity(key);
    return e ? (locale === 'ar' ? e.labelAr : e.labelEn) : key;
  };

  return (
    <div className="space-y-6">
      <Link href="/settings/onboarding" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('onboarding.title')}
      </Link>
      <PageHeader title={t('onboarding.history.title')} description={t('onboarding.history.subtitle')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('onboarding.history.total')} value={String(summary.jobs)} icon={Layers} tone="info" />
        <StatCard label={t('onboarding.progress.complete')} value={`${summary.successRate}%`} icon={CheckCircle2} tone={HEALTH_TONE[health]} />
        <StatCard label={t('onboarding.history.failed')} value={String(summary.failed)} icon={XCircle} tone={summary.failed > 0 ? 'destructive' : 'success'} />
        <StatCard label={t('onboarding.history.success')} value={String(summary.successRows)} icon={Activity} tone="primary" />
      </div>

      {jobs.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('onboarding.history.empty')}</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t('onboarding.history.file')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('onboarding.history.entity')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('onboarding.history.status')}</th>
                <th className="px-4 py-2 text-end font-medium">{t('onboarding.history.total')}</th>
                <th className="px-4 py-2 text-end font-medium">{t('onboarding.history.success')}</th>
                <th className="px-4 py-2 text-end font-medium">{t('onboarding.history.failed')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('onboarding.history.date')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t">
                  <td className="px-4 py-2">{j.file_name ?? '—'}</td>
                  <td className="px-4 py-2">{label(j.target_entity)}</td>
                  <td className="px-4 py-2">
                    <Badge variant={STATUS_VARIANT[(j.status ?? '').toLowerCase()] ?? 'secondary'}>{j.status ?? '—'}</Badge>
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">{j.total_rows ?? 0}</td>
                  <td className="px-4 py-2 text-end text-success tabular-nums">{j.success_rows ?? 0}</td>
                  <td className="px-4 py-2 text-end text-destructive tabular-nums">{j.failed_rows ?? 0}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
