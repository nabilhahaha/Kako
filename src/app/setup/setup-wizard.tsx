'use client';

import { useState, useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import {
  Check, ArrowLeft, ArrowRight, Loader2, Sparkles, Boxes, Users, LayoutDashboard, ClipboardCheck,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { SetupProfile } from '@/lib/erp/setup-wizard';
import { ALL_ROLES } from '@/lib/erp/setup-wizard';
import { classifyModuleKey } from '@/lib/erp/licensing-catalog';
import { applySetupProfile, skipSetup } from './actions';

/**
 * Smart Setup Wizard (client). A non-breaking layer above the platform: it
 * customizes the selected business-type template, previews roles + dashboard
 * KPIs, then persists the enabled modules via a guarded server action and sends
 * the user to the existing dashboard. Premium glass UI, RTL/LTR, responsive.
 */
export function SetupWizard({
  profile,
  companyName,
  businessLabel,
}: {
  profile: SetupProfile;
  companyName: string;
  businessLabel: string;
}) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const tr = (a: string, e: string) => (ar ? a : e);

  // Steps: [business questions…] → modules → suggested roles → review.
  const totalSteps = profile.questions.length + 3;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    // Seed module toggles with their defaults so the review reflects them.
    const seed: Record<string, string> = {};
    for (const t of profile.moduleToggles) seed[`mod:${t.module}`] = t.defaultOn ? 'on' : 'off';
    return seed;
  });
  const [pending, startTransition] = useTransition();
  const [showAllRoles, setShowAllRoles] = useState(false);

  const isQuestionStep = step < profile.questions.length;
  const isModuleStep = step === profile.questions.length;
  const isRolesStep = step === profile.questions.length + 1;
  const isReview = step === totalSteps - 1;

  function choose(qid: string, value: string) {
    setAnswers((a) => ({ ...a, [qid]: value }));
  }
  function toggleMod(module: string, on: boolean) {
    setAnswers((a) => ({ ...a, [`mod:${module}`]: on ? 'on' : 'off' }));
  }

  const enabledModules = useMemo(
    () => profile.moduleToggles.filter((t) => (answers[`mod:${t.module}`] ?? (t.defaultOn ? 'on' : 'off')) === 'on'),
    [profile.moduleToggles, answers],
  );

  function finish() {
    startTransition(async () => {
      const res = await applySetupProfile(answers);
      if (!res.ok) { toast.error(res.error ?? tr('حدث خطأ', 'Something went wrong')); return; }
      window.location.href = '/dashboard';
    });
  }
  function skip() {
    startTransition(async () => { await skipSetup(); window.location.href = '/dashboard'; });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c0a14] text-white">
      {/* premium dark backdrop */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 50% -10%, rgba(124,58,237,0.28), transparent 60%), radial-gradient(50% 40% at 90% 10%, rgba(34,211,238,0.14), transparent 60%)' }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '26px 26px', WebkitMaskImage: 'radial-gradient(70% 60% at 50% 30%, #000, transparent)', maskImage: 'radial-gradient(70% 60% at 50% 30%, #000, transparent)' }} />

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8 sm:py-10">
        {/* header */}
        <div className="mb-7 flex items-center justify-between">
          <Logo withWordmark className="text-white [&_span]:text-white" />
          <button onClick={skip} disabled={pending} className="text-sm text-white/60 hover:text-white">{tr('تخطّي', 'Skip')}</button>
        </div>

        {/* intro chip */}
        <div className="mb-5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-[#c4b5fd]" /> {companyName} · {businessLabel}
          </span>
          <p className="mt-3 text-white/70">{ar ? profile.introAr : profile.introEn}</p>
        </div>

        {/* stepper progress */}
        <div className="mb-7 flex gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-white/15'}`} />
          ))}
        </div>

        {/* body */}
        <div className="ams-fade flex-1">
          {/* ── business / branching questions ── */}
          {isQuestionStep && (() => {
            const q = profile.questions[step];
            const chosen = answers[q.id] ?? q.options[0].value;
            return (
              <>
                <h1 className="mb-5 text-2xl font-bold">{ar ? q.titleAr : q.titleEn}</h1>
                <div className="space-y-3">
                  {q.options.map((o) => {
                    const active = o.value === chosen;
                    return (
                      <button key={o.value} onClick={() => choose(q.id, o.value)}
                        className={`flex w-full items-start gap-3 rounded-xl border p-4 text-start backdrop-blur transition ${active ? 'border-primary bg-primary/15 ring-1 ring-primary' : 'border-white/12 bg-white/[0.04] hover:border-white/30'}`}>
                        <Radio active={active} />
                        <span>
                          <span className="block font-medium">{ar ? o.labelAr : o.labelEn}</span>
                          {(ar ? o.descAr : o.descEn) && <span className="mt-0.5 block text-sm text-white/55">{ar ? o.descAr : o.descEn}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* ── modules — grouped: Core Modules + Industry Pack ── */}
          {isModuleStep && (() => {
            const coreToggles = profile.moduleToggles.filter((t) => classifyModuleKey(t.module) === 'core');
            const packToggles = profile.moduleToggles.filter((t) => classifyModuleKey(t.module) === 'pack');
            const Row = (t: SetupProfile['moduleToggles'][number]) => {
              const on = (answers[`mod:${t.module}`] ?? (t.defaultOn ? 'on' : 'off')) === 'on';
              return (
                <button key={t.module} onClick={() => toggleMod(t.module, !on)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-start backdrop-blur transition ${on ? 'border-primary/60 bg-primary/10' : 'border-white/12 bg-white/[0.04]'}`}>
                  <span className="font-medium">{ar ? t.labelAr : t.labelEn}</span>
                  <Switch on={on} />
                </button>
              );
            };
            return (
              <>
                <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold"><Boxes className="h-6 w-6 text-[#c4b5fd]" /> {tr('الوحدات والباقات', 'Modules & packs')}</h1>
                <p className="mb-5 text-sm text-white/60">{tr('فعّل أو أوقف ما يناسب نشاطك — تقدر تغيّرها لاحقاً. اختيار نوع النشاط يقترح الافتراضيات فقط.', 'Turn on what fits your business — you can change this later. Business type only suggests defaults.')}</p>
                {coreToggles.length > 0 && (
                  <div className="mb-5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">{tr('الوحدات الأساسية', 'Core Modules')}</div>
                    <div className="space-y-2.5">{coreToggles.map(Row)}</div>
                  </div>
                )}
                {packToggles.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">{tr('باقة القطاع', 'Industry Pack')}</div>
                    <div className="space-y-2.5">{packToggles.map(Row)}</div>
                  </div>
                )}
              </>
            );
          })()}

          {/* ── suggested roles (generated from the industry pack; editable) ── */}
          {isRolesStep && (
            <>
              <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold"><Users className="h-6 w-6 text-[#c4b5fd]" /> {tr('الأدوار المقترحة', 'Suggested roles')}</h1>
              <p className="mb-5 text-sm text-white/60">{tr('هذه الأدوار تُنشأ تلقائياً حسب نوع نشاطك، وتقدر تعدّلها بالكامل لاحقاً من الإعدادات ← الصلاحيات. اختيار نوع النشاط يقترح فقط.', 'These roles are created automatically for your business type. You can fully edit them later in Settings → Permissions. Business type only suggests them.')}</p>
              <div className="space-y-2.5">
                {profile.roles.map((r) => (
                  <div key={r.en} className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.04] p-4 backdrop-blur">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-[#c4b5fd]"><Users className="h-4 w-4" /></span>
                    <span className="font-medium">{ar ? r.ar : r.en}</span>
                    <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"><Check className="h-3 w-3" /> {tr('سيُضاف', 'Will be added')}</span>
                  </div>
                ))}
              </div>

              {/* Secondary option: reveal the full platform role catalog. The
                  industry-specific set above stays the default experience. */}
              <button
                type="button"
                onClick={() => setShowAllRoles((v) => !v)}
                className="mt-4 text-sm font-medium text-[#c4b5fd] hover:text-white"
              >
                {showAllRoles ? tr('إخفاء كل الأدوار', 'Hide all roles') : tr('عرض كل الأدوار', 'Show all roles')}
              </button>
              {showAllRoles && (
                <div className="mt-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">{tr('كل الأدوار المتاحة', 'All available roles')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_ROLES.map((r) => (
                      <span key={r.en} className="rounded-full border border-white/12 bg-white/10 px-2.5 py-1 text-xs">{ar ? r.ar : r.en}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── review ── */}
          {isReview && (
            <>
              <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-6 w-6 text-[#c4b5fd]" /> {tr('مراجعة الإعداد', 'Review setup')}</h1>
              <div className="space-y-4">
                <ReviewCard icon={Sparkles} title={tr('نوع النشاط', 'Business type')}>
                  <span className="text-sm">{businessLabel}</span>
                </ReviewCard>
                <ReviewCard icon={Boxes} title={tr('الوحدات المفعّلة', 'Enabled modules')}>
                  <Chips items={enabledModules.map((t) => (ar ? t.labelAr : t.labelEn))} empty={tr('لا شيء', 'None')} />
                </ReviewCard>
                <ReviewCard icon={Users} title={tr('الأدوار المقترحة', 'Suggested roles')}>
                  <Chips items={profile.roles.map((r) => (ar ? r.ar : r.en))} />
                </ReviewCard>
                <ReviewCard icon={LayoutDashboard} title={tr('مؤشرات لوحة التحكم', 'Dashboard KPIs')}>
                  <Chips items={profile.kpis.map((k) => (ar ? k.ar : k.en))} />
                </ReviewCard>
              </div>
            </>
          )}
        </div>

        {/* nav */}
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
            {tr('السابق', 'Back')}
          </Button>
          {isReview ? (
            <Button onClick={finish} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {tr('أنشئ مساحة العمل', 'Create My Workspace')}
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)} disabled={pending}>
              {tr('التالي', 'Next')} <Arrow className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Radio({ active }: { active: boolean }) {
  return (
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-white/30'}`}>
      {active && <Check className="h-3.5 w-3.5" />}
    </span>
  );
}
function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-white/20'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'start-[1.125rem]' : 'start-0.5'}`} />
    </span>
  );
}
function ReviewCard({ icon: Icon, title, children }: { icon: typeof Boxes; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/12 bg-white/[0.04] p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80"><Icon className="h-4 w-4 text-[#c4b5fd]" /> {title}</div>
      {children}
    </div>
  );
}
function Chips({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="text-sm text-white/50">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span key={it} className="rounded-full border border-white/12 bg-white/10 px-2.5 py-1 text-xs">{it}</span>
      ))}
    </div>
  );
}
