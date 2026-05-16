import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { homeForRole } from '@/lib/permissions';
import { LoginForm } from '@/components/auth/LoginForm';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function LoginPage() {
  const navigate = useNavigate();
  const { session, profile, initialized } = useAuthStore();

  useEffect(() => {
    if (initialized && session && profile) {
      navigate(homeForRole(profile.role), { replace: true });
    }
  }, [initialized, session, profile, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-50"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, hsl(0 72% 51% / 0.08), transparent 60%)',
        }}
      />
      <div className="w-full max-w-md">
        <Card className="border-border/60 shadow-xl shadow-black/[0.03]">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <span className="text-h2 font-bold tracking-tight">FS</span>
            </div>
            <div>
              <h1 className="text-h1 text-foreground">مرحباً بك في FieldSync</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Roshen × Relia — سجّل الدخول للمتابعة
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          FieldSync v0.1 — منصة المبيعات الميدانية
        </p>
      </div>
    </div>
  );
}
