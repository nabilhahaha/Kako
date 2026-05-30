'use client';

import { BrandBg, ProductMockup } from './brand-preview';
import { useI18n } from '@/lib/i18n/provider';

/** The premium branded side of the auth screens (login / register): a vibrant
 *  maroon splash with the AMS wordmark, a headline, and a realistic light-theme
 *  product mockup as the hero. Self-translates by `variant`. Hidden on mobile. */
export function AuthBrandPanel({ variant = 'login' }: { variant?: 'login' | 'register' }) {
  const { t } = useI18n();
  const isRegister = variant === 'register';
  const line1 = isRegister ? t('auth.registerHeadline1') : t('auth.panelHeadline1');
  const line2 = isRegister ? t('auth.registerHeadline2') : t('auth.panelHeadline2');
  const subtext = isRegister ? t('auth.registerPanelSubtext') : t('brand.tagline');

  return (
    <div className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
      <BrandBg />

      <div className="relative z-10 w-full max-w-xl px-14 text-center text-white">
        {/* wordmark */}
        <div className="mb-7 inline-flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-sm font-bold tracking-tight shadow-lg backdrop-blur" dir="ltr">
            AMS
          </span>
          <span className="text-lg font-bold tracking-tight" dir="ltr">AMS</span>
        </div>

        <h2 className="text-[2.5rem] font-bold leading-[1.18]">
          {line1}
          <br />
          {line2}
        </h2>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-white/80">{subtext}</p>

        {/* hero product mockup */}
        <div className="mt-12 flex justify-center">
          <ProductMockup />
        </div>
      </div>
    </div>
  );
}
