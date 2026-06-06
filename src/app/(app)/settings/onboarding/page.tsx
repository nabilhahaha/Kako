import Link from 'next/link';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { redirect } from 'next/navigation';
import {
  Rocket, Upload, ListChecks, History, Undo2, Bookmark, Plug, ArrowRight,
  CheckCircle2, FileDown, type LucideIcon,
} from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getEntity } from '@/lib/erp/entities';
import { buildOnboardingPlan, type OnboardingJobLike, type OnboardingStatus } from '@/lib/erp/onboarding';

// Customer Onboarding cockpit — a guided, phased migration experience on top of
// the Integration Hub + Import Engine. Additive; reuses erp_import_jobs + the
// import wizard; no new tables, no AI, no analytics.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

const STATUS_VARIANT: Record<OnboardingStatus, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  notStarted: 'secondary', inProgress: 'warning', completed: 'success', failed: 'destructive',
};

export default async function OnboardingPage() {
  await requireNonRetailAdmin();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'integrations.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();

  const jobs = await safe(async () => {
    const { data } = await supabase
      .from('erp_import_jobs')
      .select('target_entity, status, success_rows, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    return (data ?? []) as OnboardingJobLike[];
  }, []);

  const plan = buildOnboardingPlan(jobs);
  const label = (key: string) => {
    const e = getEntity(key);
    return e ? (locale === 'ar' ? e.labelAr : e.labelEn) : key;
  };
  // First not-yet-completed step (dependency-ordered) = the recommended next action.
  const nextStep = plan.steps.find((s) => s.status !== 'completed') ?? null;

  const tools: { icon: LucideIcon; key: string; href: string }[] = [
    { icon: Upload, key: 'upload', href: '/settings/import' },
    { icon: ListChecks, key: 'validation', href: '/settings/onboarding/validation' },
    { icon: History, key: 'history', href: '/settings/onboarding/history' },
    { icon: Undo2, key: 'rollback', href: '/settings/onboarding/rollback' },
    { icon: Bookmark, key: 'templates', href: '/settings/import' },
    { icon: Plug, key: 'connectors', href: '/settings/import?source=erpnext' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('onboarding.title')} description={t('onboarding.subtitle')} />

      {/* Progress */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Rocket className="h-4 w-4 text-primary" /> {t('onboarding.progress.label')}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground" dir="ltr">
              {plan.completedCount}/{plan.totalCount} {t('onboarding.progress.entities')} · {plan.progress}% {t('onboarding.progress.complete')}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${plan.progress}%` }} />
          </div>
          {nextStep ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{t('onboarding.nextUp')}:</span>{' '}
              <Link href={`/settings/import?entity=${nextStep.key}`} className="text-primary hover:underline">
                {label(nextStep.key)}
              </Link>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> {t('onboarding.allDone')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Phased sequencing */}
      {plan.groups.map((g) => (
        <section key={g.phase} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{t(`onboarding.phases.${g.phase}.t`)}</h2>
            <p className="text-sm text-muted-foreground">{t(`onboarding.phases.${g.phase}.d`)}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.steps.map((s) => (
              <Card key={s.key} className="h-full">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{label(s.key)}</span>
                    <Badge variant={STATUS_VARIANT[s.status]}>{t(`onboarding.status.${s.status}`)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.status === 'completed' || s.jobs > 0 ? (
                      <span dir="ltr">{s.successRows} {t('onboarding.step.rows')} · {s.jobs} {t('onboarding.step.jobs')}</span>
                    ) : s.dependsOn.length > 0 ? (
                      <span>{t('onboarding.step.dependsOn')}: {s.dependsOn.map(label).join('، ')}</span>
                    ) : (
                      <span>&nbsp;</span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Link
                      href={`/settings/import?entity=${s.key}`}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Upload className="h-3.5 w-3.5" /> {t('onboarding.step.import')}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {/* Tools */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <FileDown className="me-1 inline h-4 w-4" />
          {t('onboarding.cards.upload.t')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((a) => (
            <Link key={a.key} href={a.href} className="group rounded-xl">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="flex h-full flex-col gap-2 p-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><a.icon className="h-5 w-5" /></span>
                  <h3 className="flex items-center gap-1.5 font-semibold">
                    {t(`onboarding.cards.${a.key}.t`)}
                    <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t(`onboarding.cards.${a.key}.d`)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
