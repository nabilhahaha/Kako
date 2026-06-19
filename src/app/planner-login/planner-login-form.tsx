'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Route as RouteIcon, Compass, LayoutGrid, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { RoutePlannerLogo } from '@/components/route-planner/brand-logo';
import { WhatsAppContact } from '@/components/route-planner/whatsapp-contact';
import { buildSupportWhatsAppUrl } from '@/lib/erp/route-planner-subscription';

/**
 * Standalone Route Planner login — a self-contained, SaaS-styled sign-in that feels
 * like its own product, not the VANTORA ERP. Same Supabase email/password auth, but it
 * always lands the user on the planner. The normal /login flow is untouched.
 */
export function PlannerLoginForm() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      toast.error(t('auth.loginFailed'), {
        description: error.message === 'Invalid login credentials' ? t('auth.loginBadCredentials') : error.message,
      });
      setLoading(false);
      return;
    }
    toast.success(t('auth.loginSuccess'));
    // Standalone product → straight to the planner.
    router.push('/distribution/route-planner');
    router.refresh();
  }

  // The four product capabilities — communicated before the user even signs in.
  const caps = [
    { icon: RouteIcon, label: t('routePlanner.cap_planning'), desc: t('routePlanner.cap_planningDesc') },
    { icon: Compass, label: t('routePlanner.cap_optimization'), desc: t('routePlanner.cap_optimizationDesc') },
    { icon: LayoutGrid, label: t('routePlanner.cap_current'), desc: t('routePlanner.cap_currentDesc') },
    { icon: CalendarDays, label: t('routePlanner.cap_journey'), desc: t('routePlanner.cap_journeyDesc') },
  ];

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      {/* Brand / marketing panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/70 p-10 text-primary-foreground lg:flex">
        <RoutePlannerLogo size={30} tone="invert" />
        <div className="max-w-md space-y-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{t('routePlanner.plannerLoginTrial')}</span>
          <h1 className="text-3xl font-bold leading-tight">{t('routePlanner.plannerLoginHeadline')}</h1>
          {/* Territory-planning illustration (inline SVG — clusters + route stops). */}
          <svg viewBox="0 0 320 150" className="w-full max-w-sm rounded-xl bg-white/10 p-2" role="img" aria-label="Territory planning illustration">
            {([['#bfdbfe', 60, 50], ['#bbf7d0', 220, 45], ['#fde68a', 130, 110], ['#fbcfe8', 260, 110]] as [string, number, number][]).map(([c, cx, cy], i) => (
              <g key={i}>
                {[...Array(6)].map((_, j) => <circle key={j} cx={cx + Math.cos(j * 1.3) * 24} cy={cy + Math.sin(j * 1.9) * 18} r="3.5" fill={c} />)}
                <circle cx={cx} cy={cy} r="6" fill="none" stroke={c} strokeWidth="2" />
              </g>
            ))}
            <path d="M60 50 L130 110 L220 45 L260 110" fill="none" stroke="white" strokeWidth="1.6" strokeDasharray="4 4" opacity="0.6" />
          </svg>
          <ul className="space-y-2.5">
            {caps.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15"><c.icon className="h-4 w-4" /></span>
                <span><span className="font-semibold">{c.label}</span><span className="block text-xs opacity-80">{c.desc}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-70">© VANTORA Route Planner</p>
        {/* faint map-grid texture */}
        <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-col items-center justify-center p-6">
        <div className="absolute end-4 top-4 inline-flex overflow-hidden rounded-md border text-xs">
          <button onClick={() => setLocale('en')} className={`px-3 py-1 ${locale === 'en' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-background hover:bg-muted'}`}>English</button>
          <button onClick={() => setLocale('ar')} className={`border-s px-3 py-1 ${locale === 'ar' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-background hover:bg-muted'}`}>العربية</button>
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5 text-center lg:hidden">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><RouteIcon className="h-6 w-6" /></div>
            <p className="text-lg font-bold">VANTORA <span className="font-medium text-muted-foreground">Route Planner</span></p>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">{t('routePlanner.plannerLoginTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('routePlanner.plannerLoginWelcome')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" dir="ltr" className="text-left" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" dir="ltr" className="text-left" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('routePlanner.plannerLoginSubmit')}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">{t('routePlanner.plannerLoginFootnote')}</p>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t('routePlanner.needHelp')}</span>
            <WhatsAppContact url={buildSupportWhatsAppUrl()} label={t('routePlanner.contactWhatsApp')} tone="outline" />
          </div>
        </div>
      </div>
    </div>
  );
}
