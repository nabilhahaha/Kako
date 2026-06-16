import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';

export function LoginPage() {
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) toast.error(error);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-primary">{env.appName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Field visit & market intelligence</p>
      </div>

      {!configured && (
        <div className="mb-4 rounded-lg bg-warning/15 p-3 text-sm text-warning-foreground">
          Backend not configured. Set VITE_FI_SUPABASE_URL and VITE_FI_SUPABASE_PUBLISHABLE_KEY.
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" size="lg" disabled={busy || !configured} className="mt-2">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
