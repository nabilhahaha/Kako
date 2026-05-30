'use client';

import { BrandScene } from './brand-preview';
import { useI18n } from '@/lib/i18n/provider';

/** The premium branded side of the auth screens (login / register): a dark
 *  brand splash — glowing AMS mark, headline, and a scene of floating glass UI
 *  cards. Self-translates by `variant`. Hidden on mobile. */
export function AuthBrandPanel({ variant = 'login' }: { variant?: 'login' | 'register' }) {
  const { t } = useI18n();
  const isRegister = variant === 'register';
  const line1 = isRegister ? t('auth.registerHeadline1') : t('auth.panelHeadline1');
  const line2 = isRegister ? t('auth.registerHeadline2') : t('auth.panelHeadline2');
  const subtext = isRegister ? t('auth.registerPanelSubtext') : t('brand.tagline');

  return (
    <div className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
      <BrandScene />

      <div className="relative z-10 px-12 text-center text-white">
        {/* glowing AMS mark */}
        <div className="relative mx-auto mb-8 h-20 w-20">
          <div className="absolute inset-0 rounded-3xl blur-2xl" style={{ background: 'rgba(232,176,75,0.45)' }} />
          <div
            className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-white/20 bg-white/10 text-2xl font-bold tracking-tight shadow-2xl backdrop-blur"
            dir="ltr"
          >
            AMS
          </div>
        </div>

        <h2 className="text-4xl font-bold leading-[1.25]">
          {line1}
          <br />
          {line2}
        </h2>
        <p className="mx-auto mt-4 max-w-sm leading-relaxed text-white/75">{subtext}</p>
      </div>
    </div>
  );
}
