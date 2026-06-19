'use client';

import Link from 'next/link';
import { Route as RouteIcon, LayoutGrid, Compass, CalendarDays, Upload, MousePointerClick, CheckCircle2, FileDown, ArrowRight, MessageCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { RoutePlannerLogo } from '@/components/route-planner/brand-logo';
import { buildRenewWhatsAppUrl } from '@/lib/erp/route-planner-subscription';

/**
 * Public marketing landing for the standalone Route Planner product. Branded, AR/EN,
 * SaaS-style. CTAs route to the dedicated /planner-login. No ERP chrome.
 */
export function PlannerLanding() {
  const { t, locale, setLocale } = useI18n();

  const features = [
    { icon: RouteIcon, title: t('routePlanner.cap_planning'), desc: t('routePlanner.cap_planningDesc') },
    { icon: Compass, title: t('routePlanner.cap_optimization'), desc: t('routePlanner.cap_optimizationDesc') },
    { icon: LayoutGrid, title: t('routePlanner.cap_current'), desc: t('routePlanner.cap_currentDesc') },
    { icon: CalendarDays, title: t('routePlanner.cap_journey'), desc: t('routePlanner.cap_journeyDesc') },
  ];
  const steps = [
    { icon: Upload, label: t('routePlanner.lpStep1') },
    { icon: MousePointerClick, label: t('routePlanner.lpStep2') },
    { icon: CheckCircle2, label: t('routePlanner.lpStep3') },
    { icon: FileDown, label: t('routePlanner.lpStep4') },
  ];
  const contact = buildRenewWhatsAppUrl('', '');

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <RoutePlannerLogo size={28} />
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border text-xs">
              <button onClick={() => setLocale('en')} className={`px-2.5 py-1 ${locale === 'en' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-background hover:bg-muted'}`}>English</button>
              <button onClick={() => setLocale('ar')} className={`border-s px-2.5 py-1 ${locale === 'ar' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-background hover:bg-muted'}`}>العربية</button>
            </div>
            <Link href="/planner-login" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">{t('routePlanner.lpSignIn')}</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{t('routePlanner.lpBadge')}</span>
            <h1 className="text-4xl font-bold leading-tight tracking-tight lg:text-5xl">{t('routePlanner.lpHero')}</h1>
            <p className="max-w-md text-lg text-muted-foreground">{t('routePlanner.lpHeroSub')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/planner-login" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110">
                {t('routePlanner.lpStartTrial')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
              <a href={contact} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
                <MessageCircle className="h-4 w-4" /> {t('routePlanner.lpContact')}
              </a>
            </div>
            <p className="text-xs text-muted-foreground">{t('routePlanner.lpTrialNote')}</p>
          </div>
          {/* Inline product illustration */}
          <div className="relative">
            <div className="rounded-2xl border bg-card p-4 shadow-xl">
              <div className="mb-3 flex items-center gap-2"><RoutePlannerLogo size={22} showProduct={false} /><span className="text-xs text-muted-foreground">{t('routePlanner.title')}</span></div>
              <svg viewBox="0 0 320 200" className="w-full rounded-lg bg-muted/40" role="img" aria-label="Route map preview">
                {[['#2563eb', 60, 70], ['#16a34a', 200, 60], ['#f59e0b', 130, 150], ['#db2777', 250, 140]].map(([c, cx, cy], i) => (
                  <g key={i}>
                    {[...Array(6)].map((_, j) => <circle key={j} cx={(cx as number) + Math.cos(j) * 26} cy={(cy as number) + Math.sin(j * 1.7) * 22} r="4" fill={c as string} opacity="0.85" />)}
                    <circle cx={cx as number} cy={cy as number} r="7" fill="none" stroke={c as string} strokeWidth="2" />
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-2 text-center text-2xl font-bold tracking-tight">{t('routePlanner.lpFeaturesTitle')}</h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-sm text-muted-foreground">{t('routePlanner.lpFeaturesSub')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5 transition hover:shadow-md">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><f.icon className="h-5 w-5" /></div>
              <p className="font-semibold">{f.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="mb-10 text-center text-2xl font-bold tracking-tight">{t('routePlanner.lpHowTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.label} className="relative rounded-xl border bg-card p-5">
                <span className="absolute end-3 top-3 text-3xl font-bold text-muted-foreground/15">{i + 1}</span>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><s.icon className="h-5 w-5" /></div>
                <p className="text-sm font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight">{t('routePlanner.lpCtaTitle')}</h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t('routePlanner.lpCtaSub')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/planner-login" className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110">{t('routePlanner.lpStartTrial')} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
          <a href={contact} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 text-sm font-semibold hover:bg-muted"><MessageCircle className="h-4 w-4" /> {t('routePlanner.lpContact')}</a>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <RoutePlannerLogo size={20} />
          <span>© VANTORA · {t('routePlanner.lpFooter')}</span>
        </div>
      </footer>
    </div>
  );
}
