'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { LoginForm } from '@/app/login/login-form';
import { Logo } from '@/components/brand/logo';
import { useI18n } from '@/lib/i18n/provider';

/** Premium glassmorphism login modal. */
export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="ams-fade absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* glass card */}
      <div className="ams-pop relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-background/85 p-7 shadow-2xl backdrop-blur-2xl">
        {/* brand glow */}
        <div className="pointer-events-none absolute -top-16 end-0 h-40 w-40 rounded-full blur-3xl" style={{ background: 'rgba(143,29,46,0.30)' }} />

        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute end-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative">
          <Logo size="lg" withWordmark />
          <h2 className="mt-6 text-2xl font-bold">{t('landing.modal.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('landing.modal.subtitle')}</p>

          <div className="mt-6">
            <LoginForm bare />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('landing.modal.noAccount')}{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              {t('landing.modal.createCompanyCta')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
