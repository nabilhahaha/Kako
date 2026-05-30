'use client';

import { BrandScene } from './brand-preview';
import { useI18n } from '@/lib/i18n/provider';

/** The premium branded side of the auth screens (login / register): a refined
 *  dark brand splash — a haloed AMS mark with orbit rings, gradient headline,
 *  and a scene of floating glass UI cards. Self-translates by `variant`.
 *  Hidden on mobile. */
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
        {/* haloed AMS mark with orbit rings */}
        <div className="relative mx-auto mb-9 h-24 w-24">
          {/* orbit rings */}
          <div className="absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2">
            {['11rem', '17rem', '23rem'].map((s, i) => (
              <span
                key={s}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                style={{ width: s, height: s, borderColor: `rgba(255,255,255,${0.1 - i * 0.025})` }}
              />
            ))}
            {/* a dot orbiting on the middle ring */}
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 translate-x-[8.5rem] rounded-full" style={{ background: 'rgba(232,176,75,0.9)' }} />
          </div>

          {/* conic glow halo */}
          <div className="absolute -inset-4 rounded-[2rem] opacity-60 blur-2xl" style={{ background: 'conic-gradient(from 200deg, #e8b04b, #8f1d2e, #c0392b, #e8b04b)' }} />

          {/* gradient-bordered glass badge */}
          <div className="relative h-24 w-24 rounded-[1.6rem] p-px shadow-2xl" style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.4), rgba(232,176,75,0.25))' }}>
            <div className="flex h-full w-full items-center justify-center rounded-[1.55rem] bg-[#240a13]/90 backdrop-blur-xl" dir="ltr">
              <span className="bg-gradient-to-b from-white to-[rgba(232,176,75,0.85)] bg-clip-text text-2xl font-bold tracking-tight text-transparent">AMS</span>
            </div>
          </div>
        </div>

        <h2 className="bg-gradient-to-b from-white to-white/65 bg-clip-text text-[2.6rem] font-bold leading-[1.2] text-transparent">
          {line1}
          <br />
          {line2}
        </h2>
        <p className="mx-auto mt-5 max-w-sm leading-relaxed text-white/70">{subtext}</p>
      </div>
    </div>
  );
}
