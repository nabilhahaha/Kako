import Link from 'next/link';
import { LoginForm } from './login-form';
import { Logo } from '@/components/brand/logo';
import { AuthBrandPanel } from '@/components/brand/auth-brand-panel';
import { AuthAmbientBg } from '@/components/brand/auth-ambient-bg';

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form side — ambient brand background on mobile, plain on desktop */}
      <div className="relative flex items-center justify-center p-6 sm:p-10 lg:bg-background">
        <AuthAmbientBg className="lg:hidden" />
        <div className="relative z-10 w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl sm:p-8 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="mb-8">
            <Logo size="lg" withWordmark />
            <h1 className="mt-6 text-2xl font-bold">أهلاً بعودتك 👋</h1>
            <p className="mt-1 text-sm text-muted-foreground">سجّل دخولك لإدارة أعمالك</p>
          </div>

          <LoginForm />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ليس لديك حساب؟{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              أنشئ شركتك وابدأ مجاناً
            </Link>
          </p>
        </div>
      </div>

      {/* Brand panel */}
      <AuthBrandPanel />
    </div>
  );
}
