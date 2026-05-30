import Link from 'next/link';
import { Check, ArrowLeft, MessageCircle } from 'lucide-react';
import type { PromoTheme } from '@/lib/erp/promo-themes';
import { whatsappLink, SUPPORT_PHONES } from '@/lib/erp/contact';

/** Ad-style promotional hero, themed per business type. Pure CSS (gradient,
 *  aurora, dot grid, glass device mockup) — shareable as a marketing page. */
export function PromoHero({ theme }: { theme: PromoTheme }) {
  const Icon = theme.icon;
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0" style={{ background: theme.gradient }} />
      <div className="ams-aura absolute -top-24 -left-20 h-[26rem] w-[26rem] rounded-full blur-3xl" style={{ background: theme.accent }} />
      <div className="ams-aura-2 absolute -bottom-24 -right-16 h-[30rem] w-[30rem] rounded-full blur-3xl" style={{ background: 'rgba(255,255,255,0.10)' }} />
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, transparent 45%, rgba(0,0,0,0.30) 100%)' }} />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        {/* top bar */}
        <header className="flex items-center justify-between">
          <span dir="ltr" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-sm font-bold tracking-tight backdrop-blur">AMS</span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">نظام {theme.vertical}</span>
        </header>

        {/* main */}
        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-2">
          {/* copy */}
          <div>
            <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur">
              <Icon className="h-7 w-7" />
            </span>
            <h1 className="whitespace-pre-line text-4xl font-bold leading-[1.2] sm:text-5xl">{theme.headline}</h1>
            <p className="mt-5 max-w-md leading-relaxed text-white/85">{theme.subline}</p>

            <ul className="mt-7 grid max-w-md gap-2 sm:grid-cols-2">
              {theme.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/90">
                  <Check className="h-4 w-4 shrink-0" /> {f}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-semibold text-foreground shadow-lg hover:opacity-90">
                ابدأ مجاناً <ArrowLeft className="h-4 w-4" />
              </Link>
              <a href={whatsappLink(`مرحباً، أريد معرفة المزيد عن نظام ${theme.vertical} من AMS.`)} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 font-medium backdrop-blur hover:bg-white/20">
                <MessageCircle className="h-4 w-4" /> تواصل معنا
              </a>
            </div>
            <p className="mt-3 text-xs text-white/70">تجربة مجانية ١٤ يوم · بدون بطاقة ائتمان</p>
          </div>

          {/* device mockup */}
          <div className="flex justify-center lg:justify-end">
            <PhoneMockup Icon={Icon} vertical={theme.vertical} />
          </div>
        </div>

        {/* footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-5 text-sm text-white/80">
          <span dir="ltr" className="font-semibold">AMS · نظام إدارة الأعمال</span>
          <div className="flex flex-wrap items-center gap-4" dir="ltr">
            {SUPPORT_PHONES.map((p) => (
              <a key={p.phone} href={whatsappLink(undefined, p.phone)} target="_blank" rel="noopener noreferrer" className="hover:text-white">{p.display}</a>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}

function PhoneMockup({ Icon, vertical }: { Icon: PromoTheme['icon']; vertical: string }) {
  return (
    <div className="relative w-[260px] rounded-[2.2rem] border border-white/25 bg-white/10 p-3 shadow-2xl backdrop-blur">
      <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-white/40" />
      <div className="overflow-hidden rounded-[1.6rem] bg-white text-foreground">
        {/* app header */}
        <div className="flex items-center gap-2 bg-secondary/60 px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold">{vertical}</span>
        </div>
        {/* skeleton content */}
        <div className="space-y-2.5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-secondary/70 p-2"><div className="h-2 w-10 rounded bg-foreground/15" /><div className="mt-1.5 h-3 w-12 rounded bg-foreground/25" /></div>
            <div className="rounded-lg bg-secondary/70 p-2"><div className="h-2 w-10 rounded bg-foreground/15" /><div className="mt-1.5 h-3 w-12 rounded bg-foreground/25" /></div>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-2">
              <div className="space-y-1">
                <div className="h-2.5 w-20 rounded bg-foreground/20" />
                <div className="h-2 w-12 rounded bg-foreground/10" />
              </div>
              <div className="h-5 w-12 rounded-full bg-primary/15" />
            </div>
          ))}
          <div className="h-9 rounded-lg bg-primary" />
        </div>
      </div>
    </div>
  );
}
