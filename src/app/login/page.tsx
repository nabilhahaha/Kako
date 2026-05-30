import Link from 'next/link';
import { LoginForm } from './login-form';
import { Logo } from '@/components/brand/logo';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" className="mb-4" />
          <h1 className="text-2xl font-bold text-foreground" dir="ltr">AMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نظام إدارة الأعمال
          </p>
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
  );
}
