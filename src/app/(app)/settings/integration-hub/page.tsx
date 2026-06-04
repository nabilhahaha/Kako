import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Upload, Database, Plug, KeyRound, Webhook, ScrollText, ArrowRight, Activity, CheckCircle2, XCircle, Layers, type LucideIcon } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { summarizeImportJobs, importHealth, type ImportJobLike } from '@/lib/erp/import-monitor';
import { getEntity } from '@/lib/erp/entities';

// Integration Hub / Data Migration Center — a single entry that unifies the
// existing Import Wizard, Data Onboarding and integration connectors, and adds
// LIVE import monitoring over the existing erp_import_jobs audit (RLS-scoped).
// Additive; reuses existing screens/schema; no new tables.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

const HEALTH_TONE: Record<'good' | 'attention' | 'critical', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive' };
const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  completed: 'success', success: 'success', done: 'success',
  failed: 'destructive', error: 'destructive',
  processing: 'warning', pending: 'warning', queued: 'warning',
};

interface JobRow extends ImportJobLike { id: string; target_entity: string | null; file_name: string | null; created_at: string }

export default async function IntegrationHubPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isPlatformOwner || ctx.isSuperAdmin || hasPermission(ctx, 'integrations.manage') || ctx.memberships.some((m) => m.role === 'admin');
  if (!allowed) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();

  const jobs = await safe(async () => {
    const { data } = await supabase
      .from('erp_import_jobs')
      .select('id, target_entity, file_name, status, total_rows, success_rows, failed_rows, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    return (data ?? []) as JobRow[];
  }, []);

  const summary = summarizeImportJobs(jobs);
  const health = importHealth(summary);

  const areas: { icon: LucideIcon; key: string; href: string }[] = [
    { icon: Upload, key: 'importWizard', href: '/settings/import' },
    { icon: Database, key: 'dataOnboarding', href: '/settings/data-onboarding' },
    { icon: Plug, key: 'connections', href: '/settings/integrations/connections' },
    { icon: KeyRound, key: 'apiKeys', href: '/settings/integrations/api-keys' },
    { icon: Webhook, key: 'webhooks', href: '/settings/integrations/webhooks' },
    { icon: ScrollText, key: 'sync', href: '/settings/integrations/sync' },
  ];

  const entityLabel = (key: string | null) => {
    if (!key) return '—';
    const e = getEntity(key);
    return e ? (locale === 'ar' ? e.labelAr : e.labelEn) : key;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('inthub.title')} description={t('inthub.subtitle')} />

      {/* Live import monitoring */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('inthub.jobs')} value={String(summary.jobs)} icon={Layers} tone="info" />
        <StatCard label={t('inthub.successRate')} value={`${summary.successRate}%`} icon={CheckCircle2} tone={HEALTH_TONE[health]} />
        <StatCard label={t('inthub.failed')} value={String(summary.failed)} icon={XCircle} tone={summary.failed > 0 ? 'destructive' : 'success'} />
        <StatCard label={t('inthub.rowsImported')} value={String(summary.successRows)} icon={Activity} tone="primary" />
      </div>

      {/* Areas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <Link key={a.key} href={a.href} className="group rounded-xl">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="flex h-full flex-col gap-2 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><a.icon className="h-5 w-5" /></span>
                <h3 className="flex items-center gap-1.5 font-semibold">
                  {t(`inthub.areas.${a.key}.t`)}
                  <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{t(`inthub.areas.${a.key}.d`)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent imports (audit log) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('inthub.recent')}</h2>
        {jobs.length === 0 ? (
          <EmptyState icon={<Upload />} title={t('inthub.noJobs')} />
        ) : (
          <ul className="space-y-2">
            {jobs.slice(0, 10).map((j) => (
              <li key={j.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {entityLabel(j.target_entity)}
                        <Badge variant={STATUS_VARIANT[(j.status ?? '').toLowerCase()] ?? 'secondary'}>{j.status ?? '—'}</Badge>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{j.file_name ?? '—'} · {formatDate(j.created_at)}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {(j.success_rows ?? 0)}/{(j.total_rows ?? 0)} {t('inthub.rows')}
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
