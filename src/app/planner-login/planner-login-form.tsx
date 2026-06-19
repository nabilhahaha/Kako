'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Route as RouteIcon, MapPin, LayoutGrid, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

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

  const caps = [
    { icon: RouteIcon, label: t('routePlanner.cap_planning') },
    { icon: LayoutGrid, label: t('routePlanner.cap_current') },
    { icon: MapPin, label: t('routePlanner.cap_optimization') },
    { icon: FileDown, label: t('routePlanner.plannerLoginExport') },
  ];

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      {/* Brand / marketing panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/70 p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><RouteIcon className="h-5 w-5" /></div>
          <p className="text-lg font-bold tracking-tight">VANTORA <span className="font-medium opacity-80">Route Planner</span></p>
        </div>
        <div className="max-w-md space-y-5">
          <h1 className="text-3xl font-bold leading-tight">{t('routePlanner.plannerLoginHeadline')}</h1>
          <p className="text-sm leading-relaxed opacity-90">{t('routePlanner.plannerLoginSub')}</p>
          <ul className="space-y-2.5">
            {caps.map((c) => (
              <li key={c.label} className="flex items-center gap-2.5 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15"><c.icon className="h-4 w-4" /></span>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-70">© VANTORA · {t('routePlanner.demoBadge')}</p>
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
        </div>
      </div>
    </div>
  );
}
