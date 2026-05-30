import Link from 'next/link';
import { Package } from 'lucide-react';
import { ForgotPasswordForm } from './forgot-password-form';
import { getT } from '@/lib/i18n/server';

export default async function ForgotPasswordPage() {
  const { t } = await getT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t('auth.fpTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('auth.fpSubtitle')}
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">{t('auth.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
