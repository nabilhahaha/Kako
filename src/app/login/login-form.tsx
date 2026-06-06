'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { postLoginTarget } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

export function LoginForm({ bare = false }: { bare?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setProblem(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      const description =
        error.message === 'Invalid login credentials'
          ? t('auth.loginBadCredentials')
          : error.message;
      toast.error(t('auth.loginFailed'), { description });
      setProblem(description);
      setLoading(false);
      return;
    }

    // Confirm the browser actually holds a session, then ask the SERVER where to
    // go. Navigating to the explicit home route avoids the ambiguous '/'
    // (marketing/redirect) page, and any server-side gap is shown on screen.
    const { data: sess } = await supabase.auth.getSession();
    const target = await postLoginTarget();

    if (target.ok && target.home) {
      toast.success(t('auth.loginSuccess'));
      router.replace(target.home);
      router.refresh();
      return;
    }

    // Login succeeded client-side but the app couldn't open the workspace —
    // surface exactly why instead of silently staying on the login screen.
    const clientSession = sess.session ? 'client session: present' : 'client session: MISSING';
    setProblem(`Signed in, but could not open your workspace — ${target.stage}: ${target.detail} (${clientSession}).`);
    setLoading(false);
  }

  const form = (
        <form onSubmit={handleSubmit} className="space-y-4">
          {problem && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span dir="ltr" className="break-words text-left">{problem}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              className="text-left"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              className="text-left"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('auth.loginSubmit')}
          </Button>
          <div className="text-center">
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              {t('auth.forgotLink')}
            </Link>
          </div>
        </form>
  );

  if (bare) return form;
  return (
    <Card>
      <CardContent className="pt-6">{form}</CardContent>
    </Card>
  );
}
