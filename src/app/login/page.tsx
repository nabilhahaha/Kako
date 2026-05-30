import Link from 'next/link';
import { LoginForm } from './login-form';
import { Logo } from '@/components/brand/logo';
import { AuthBrandPanel } from '@/components/brand/auth-brand-panel';

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form side */}
      <div className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-sm">
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
