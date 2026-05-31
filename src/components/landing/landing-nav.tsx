'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { LanguageToggle } from '@/components/layout/language-toggle';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { LoginModal } from './login-modal';
import { useI18n } from '@/lib/i18n/provider';

export function LandingNav({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5">
          <Logo withWordmark />

          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#modules" className="transition-colors hover:text-foreground">{t('landing.nav.modules')}</a>
            <a href="#features" className="transition-colors hover:text-foreground">{t('landing.nav.features')}</a>
            <a href="#preview" className="transition-colors hover:text-foreground">{t('landing.nav.preview')}</a>
          </nav>

          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <ThemeToggle />
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg px-3.5 py-2 text-sm font-medium transition-colors hover:bg-secondary"
            >
              {t('landing.nav.login')}
            </button>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              {t('landing.nav.startFree')}
            </Link>
          </div>
        </div>
      </header>

      <LoginModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
