'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2, Circle, MinusCircle, ArrowRight, Rocket, Loader2, PartyPopper,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import {
  computeProgress, canGoLive, blockingSteps,
  type OnboardingStepDef, type StepStatusMap, type OnboardingStepStatus,
} from '@/lib/onboarding/state';
import { saveOnboardingStep, completeOnboarding } from '@/lib/onboarding/state-server';

/** Each onboarding step deep-links to the screen that already configures it.
 *  Pure UI mapping — no behavioural coupling to the engine. */
const STEP_HREF: Record<string, string> = {
  basics: '/settings/branches',
  industry: '/settings/features',
  modules: '/settings/features',
  organization: '/settings/organization-structure',
  reporting: '/settings/organization',
  roles: '/settings/permissions',
  approvals: '/settings/workflows',
  products: '/settings/product-structure',
  uom: '/settings/uom',
  import: '/settings/import',
  territory: '/settings/regions',
  finance: '/settings/finance',
  numbering: '/settings/numbering',
  integrations: '/settings/integration-hub',
  users: '/settings/users',
  dashboards: '/dashboard',
};

export function GoLiveChecklist({
  steps,
  initialStatus,
  completedAt,
}: {
  steps: OnboardingStepDef[];
  initialStatus: StepStatusMap;
  completedAt: string | null;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<StepStatusMap>(initialStatus);
  const [done, setDone] = useState<boolean>(Boolean(completedAt));

  const progress = useMemo(() => computeProgress(status, steps), [status, steps]);
  const ready = useMemo(() => canGoLive(status, steps), [status, steps]);
  const blocking = useMemo(() => new Set(blockingSteps(status, steps)), [status, steps]);

  const core = steps.filter((s) => !s.advanced);
  const advanced = steps.filter((s) => s.advanced);

  function setStep(step: string, next: OnboardingStepStatus) {
    // optimistic
    setStatus((prev) => ({ ...prev, [step]: next }));
    startTransition(async () => {
      const res = await saveOnboardingStep({ step, status: next });
      if (!res.ok) {
        toast.error(t('goLive.err.generic'));
        setStatus((prev) => ({ ...prev, [step]: initialStatus[step] ?? 'todo' }));
        return;
      }
      router.refresh();
    });
  }

  function goLive() {
    startTransition(async () => {
      const res = await completeOnboarding();
      if (!res.ok) { toast.error(t('goLive.err.generic')); return; }
      setDone(true);
      toast.success(t('goLive.toast.live'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Progress + Go-Live */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold leading-none">{progress.pct}%</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('goLive.progress', { done: progress.done, total: progress.total })}
              </p>
            </div>
            {done ? (
              <Badge variant="success" className="gap-1.5 px-3 py-1.5 text-sm">
                <PartyPopper className="h-4 w-4" /> {t('goLive.liveBadge')}
              </Badge>
            ) : (
              <Button onClick={goLive} disabled={pending || !ready} size="lg">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {t('goLive.goLive')}
              </Button>
            )}
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
          </div>

          {!done && !ready && (
            <p className="text-sm text-muted-foreground">
              {t('goLive.blockingHint', { count: blocking.size })}
            </p>
          )}
        </CardContent>
      </Card>

      <StepGroup
        title={t('goLive.coreTitle')}
        steps={core}
        status={status}
        blocking={blocking}
        pending={pending}
        onSet={setStep}
      />
      <StepGroup
        title={t('goLive.advancedTitle')}
        subtitle={t('goLive.advancedSubtitle')}
        steps={advanced}
        status={status}
        blocking={blocking}
        pending={pending}
        onSet={setStep}
      />
    </div>
  );
}

function StepGroup({
  title, subtitle, steps, status, blocking, pending, onSet,
}: {
  title: string;
  subtitle?: string;
  steps: OnboardingStepDef[];
  status: StepStatusMap;
  blocking: Set<string>;
  pending: boolean;
  onSet: (step: string, next: OnboardingStepStatus) => void;
}) {
  const { t } = useI18n();
  if (steps.length === 0) return null;

  return (
    <div className="space-y-2">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="space-y-2">
        {steps.map((s) => {
          const st: OnboardingStepStatus = status[s.key] ?? 'todo';
          const isDone = st === 'done';
          const isSkipped = st === 'skipped';
          const isBlocking = blocking.has(s.key);
          const href = STEP_HREF[s.key] ?? '/settings';

          return (
            <Card key={s.key} className={isBlocking ? 'border-warning/60' : undefined}>
              <CardContent className="flex items-center gap-3 p-3">
                <span className="shrink-0">
                  {isDone ? <CheckCircle2 className="h-5 w-5 text-success" />
                    : isSkipped ? <MinusCircle className="h-5 w-5 text-muted-foreground" />
                    : <Circle className={`h-5 w-5 ${isBlocking ? 'text-warning' : 'text-muted-foreground'}`} />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`goLive.step.${s.key}`)}</span>
                    {s.required
                      ? <Badge variant="outline" className="text-[10px]">{t('goLive.required')}</Badge>
                      : <Badge variant="secondary" className="text-[10px]">{t('goLive.optional')}</Badge>}
                    {isBlocking && <Badge variant="warning" className="text-[10px]">{t('goLive.needed')}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{t(`goLive.stepHint.${s.key}`)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Link href={href} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                    {t('goLive.open')} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                  {isDone ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSet(s.key, 'todo')}>
                      {t('goLive.undo')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSet(s.key, 'done')}>
                      {t('goLive.markDone')}
                    </Button>
                  )}
                  {!s.required && !isSkipped && !isDone && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSet(s.key, 'skipped')}>
                      {t('goLive.skip')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
