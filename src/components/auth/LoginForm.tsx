import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import type { AppUser } from '@/lib/types';
import type { Session } from '@supabase/supabase-js';

const ADMIN_USER: AppUser = {
  id: 'demo-admin',
  email: 'admin@roshen.com',
  full_name: 'مدير النظام',
  user_type: 'admin_relia',
  region: 'الرياض',
  supervisor_id: null,
  is_active: true,
};

export function LoginForm() {
  const navigate = useNavigate();
  const { setSession, setProfile, setInitialized } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);

  function handleLogin() {
    setSubmitting(true);

    const mockSession = {
      access_token: 'demo-token',
      refresh_token: 'demo-refresh',
      expires_in: 999999,
      token_type: 'bearer',
      user: {
        id: ADMIN_USER.id,
        email: ADMIN_USER.email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    } as unknown as Session;

    setSession(mockSession);
    setProfile(ADMIN_USER);
    setInitialized(true);

    toast.success(`مرحباً ${ADMIN_USER.full_name}`);
    navigate('/admin', { replace: true });
    setSubmitting(false);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
        <p className="text-base font-semibold text-foreground">{ADMIN_USER.full_name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{ADMIN_USER.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">مشرف النظام · {ADMIN_USER.region}</p>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={submitting}
        onClick={handleLogin}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري الدخول...
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            دخول كمدير النظام
          </>
        )}
      </Button>
    </div>
  );
}
