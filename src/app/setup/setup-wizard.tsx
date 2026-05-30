'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import { Check, ArrowLeft, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { SetupProfile } from '@/lib/erp/setup-wizard';
import { applySetupProfile, skipSetup } from './actions';

export function SetupWizard({ profile, companyName }: { profile: SetupProfile; companyName: string }) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const q = profile.questions[step];
  const isLast = step === profile.questions.length - 1;
  const chosen = answers[q.id] ?? q.options[0].value;

  function choose(value: string) {
    setAnswers((a) => ({ ...a, [q.id]: value }));
  }

  function finish() {
    startTransition(async () => {
      const res = await applySetupProfile(answers);
      if (!res.ok) { toast.error(res.error ?? (ar ? 'حدث خطأ' : 'Something went wrong')); return; }
      window.location.href = '/dashboard';
    });
  }

  function skip() {
    startTransition(async () => {
      await skipSetup();
      window.location.href = '/dashboard';
    });
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        {/* header */}
        <div className="mb-8 flex items-center justify-between">
          <Logo withWordmark />
          <button onClick={skip} disabled={pending} className="text-sm text-muted-foreground hover:text-foreground">
            {ar ? 'تخطّي' : 'Skip'}
          </button>
        </div>

        {/* intro */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> {companyName}
          </span>
          <p className="mt-3 text-muted-foreground">{ar ? profile.introAr : profile.introEn}</p>
        </div>

        {/* progress */}
        <div className="mb-6 flex gap-2">
          {profile.questions.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>

        {/* question */}
        <div className="flex-1">
          <h1 className="mb-5 text-2xl font-bold">{ar ? q.titleAr : q.titleEn}</h1>
          <div className="space-y-3">
            {q.options.map((o) => {
              const active = o.value === chosen;
              return (
                <button
                  key={o.value}
                  onClick={() => choose(o.value)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-4 text-start transition ${
                    active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:border-primary/40'
                  }`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span>
                    <span className="block font-medium">{ar ? o.labelAr : o.labelEn}</span>
                    {(ar ? o.descAr : o.descEn) && (
                      <span className="mt-0.5 block text-sm text-muted-foreground">{ar ? o.descAr : o.descEn}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* nav */}
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
            {ar ? 'السابق' : 'Back'}
          </Button>
          {isLast ? (
            <Button onClick={finish} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {ar ? 'جاهز — ابدأ' : 'Done — start'}
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)} disabled={pending}>
              {ar ? 'التالي' : 'Next'} <Arrow className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
