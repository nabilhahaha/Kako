import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { resolveHomePath } from '@/lib/erp/home';
import { getT } from '@/lib/i18n/server';
import { Logo } from '@/components/brand/logo';
import { whatsappLink, SUPPORT_PHONES } from '@/lib/erp/contact';
import { LandingNav } from '@/components/landing/landing-nav';
import { Reveal } from '@/components/landing/reveal';
import { DashboardPreview } from '@/components/landing/dashboard-preview';
import {
  Stethoscope, Pill, Truck, WashingMachine, Gamepad2, ShoppingBag,
  ShoppingCart, Boxes, Users, BarChart3, ShieldCheck, Smartphone, CloudUpload, Bell,
  ArrowLeft, ArrowRight, Play, Check, Sparkles,
} from 'lucide-react';

const MODULES = [
  { key: 'clinic', icon: Stethoscope, grad: 'linear-gradient(135deg,#3b82f6,#06b6d4)' },
  { key: 'pharmacy', icon: Pill, grad: 'linear-gradient(135deg,#10b981,#22c55e)' },
  { key: 'fmcg', icon: Truck, grad: 'linear-gradient(135deg,#f59e0b,#f97316)' },
  { key: 'laundry', icon: WashingMachine, grad: 'linear-gradient(135deg,#0ea5e9,#3b82f6)' },
  { key: 'gaming', icon: Gamepad2, grad: 'linear-gradient(135deg,#8b5cf6,#a855f7)' },
  { key: 'retail', icon: ShoppingBag, grad: 'linear-gradient(135deg,#22d3ee,#6366f1)' },
] as const;

const FEATURES = [
  { key: 'sales', icon: ShoppingCart },
  { key: 'inventory', icon: Boxes },
  { key: 'crm', icon: Users },
  { key: 'reports', icon: BarChart3 },
  { key: 'users', icon: ShieldCheck },
  { key: 'mobile', icon: Smartphone },
  { key: 'backup', icon: CloudUpload },
  { key: 'notifications', icon: Bell },
] as const;

const STATS = [
  { v: '500+', key: 'companies' },
  { v: '2M+', key: 'transactions' },
  { v: '12K+', key: 'users' },
  { v: '99.9%', key: 'uptime' },
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string }>;
}) {
  const ctx = await getUserContext();
  if (ctx) redirect(resolveHomePath(ctx));

  const { t, locale } = await getT();
  const { login } = await searchParams;
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav defaultOpen={login === '1'} />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-10%] h-[28rem] w-[44rem] -translate-x-1/2 rounded-full blur-3xl" style={{ background: 'radial-gradient(closest-side, rgba(124,58,237,0.18), transparent)' }} />
          <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)/0.06) 1px, transparent 1px)', backgroundSize: '28px 28px', WebkitMaskImage: 'radial-gradient(70% 55% at 50% 30%, #000, transparent)', maskImage: 'radial-gradient(70% 55% at 50% 30%, #000, transparent)' }} />
        </div>

        <div className="mx-auto max-w-4xl px-5 pb-10 pt-20 text-center sm:pt-28">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {t('landing.hero.badge')}
            </span>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
              {t('landing.hero.title1')}
              <br />
              <span className="bg-gradient-to-br from-primary to-[#22d3ee] bg-clip-text text-transparent">{t('landing.hero.title2')}</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t('landing.hero.subtitle')}
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-7 font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90">
                {t('landing.hero.ctaStart')} <Arrow className="h-4 w-4" />
              </Link>
              <a href="#preview" className="inline-flex h-12 items-center gap-2 rounded-xl border bg-background px-6 font-medium transition hover:bg-secondary">
                <Play className="h-4 w-4" /> {t('landing.hero.ctaDemo')}
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t('landing.hero.microcopy')}</p>
          </Reveal>
        </div>
      </section>

      {/* ── Dashboard preview ── */}
      <section id="preview" className="mx-auto max-w-6xl px-5 pb-20 pt-6">
        <Reveal>
          <div style={{ perspective: '1800px' }}>
            <div style={{ transform: 'rotateX(6deg)' }}>
              <DashboardPreview />
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
            {(['p1', 'p2', 'p3'] as const).map((p) => (
              <div key={p} className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium">
                <Check className="h-4 w-4 shrink-0 text-success" /> {t(`landing.preview.${p}`)}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Modules ── */}
      <section id="modules" className="border-t bg-secondary/30 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.modules.title')}</h2>
            <p className="mt-3 text-muted-foreground">{t('landing.modules.subtitle')}</p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m, i) => (
              <Reveal key={m.key} delay={i * 60}>
                <div className="group h-full rounded-2xl border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-lg" style={{ background: m.grad }}>
                    <m.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{t(`landing.modules.${m.key}.t`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`landing.modules.${m.key}.d`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={120}>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              <Sparkles className="me-1 inline h-4 w-4 text-primary" /> {t('landing.modules.more')}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.features.title')}</h2>
            <p className="mt-3 text-muted-foreground">{t('landing.features.subtitle')}</p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.key} delay={(i % 4) * 60}>
                <div className="h-full rounded-2xl border bg-card p-5 transition duration-300 hover:border-primary/30 hover:shadow-lg">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{t(`landing.features.${f.key}.t`)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`landing.features.${f.key}.d`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y bg-gradient-to-b from-primary/5 to-transparent py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.stats.title')}</h2>
            <p className="mt-3 text-muted-foreground">{t('landing.stats.subtitle')}</p>
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.key} delay={i * 60} className="text-center">
                <div className="bg-gradient-to-br from-primary to-[#22d3ee] bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl" dir="ltr">{s.v}</div>
                <div className="mt-2 text-sm text-muted-foreground">{t(`landing.stats.${s.key}`)}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20">
        <Reveal className="mx-auto max-w-4xl px-5">
          <div className="relative overflow-hidden rounded-3xl border bg-primary px-8 py-14 text-center text-primary-foreground shadow-2xl">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-black/10 blur-3xl" />
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">{t('landing.cta.title')}</h2>
            <p className="relative mt-3 text-primary-foreground/80">{t('landing.cta.subtitle')}</p>
            <div className="relative mt-8">
              <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-8 font-semibold text-primary shadow-lg transition hover:bg-white/90">
                {t('landing.cta.button')} <Arrow className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t bg-secondary/30">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <Logo withWordmark />
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t('landing.footer.tagline')}</p>
            </div>
            <FooterCol title={t('landing.footer.colModules')}>
              <a href="#modules" className="hover:text-foreground">{t('landing.nav.modules')}</a>
              <a href="#features" className="hover:text-foreground">{t('landing.nav.features')}</a>
              <a href="#preview" className="hover:text-foreground">{t('landing.nav.preview')}</a>
            </FooterCol>
            <FooterCol title={t('landing.footer.colCompany')}>
              <Link href="/register" className="hover:text-foreground">{t('landing.footer.register')}</Link>
              <Link href="/login" className="hover:text-foreground">{t('landing.footer.login')}</Link>
              {SUPPORT_PHONES.map((p) => (
                <a key={p.phone} href={whatsappLink(undefined, p.phone)} target="_blank" rel="noopener noreferrer" className="hover:text-foreground" dir="ltr">{p.display}</a>
              ))}
            </FooterCol>
            <FooterCol title={t('landing.footer.colLegal')}>
              <Link href="/privacy" className="hover:text-foreground">{t('landing.footer.privacy')}</Link>
              <Link href="/terms" className="hover:text-foreground">{t('landing.footer.terms')}</Link>
            </FooterCol>
          </div>
          <div className="mt-12 border-t pt-6 text-center text-xs text-muted-foreground">
            VANTORA © {year} · {t('landing.footer.rights')}
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
