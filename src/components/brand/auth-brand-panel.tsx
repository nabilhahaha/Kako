'use client';

import {
  ShieldCheck,
  Wallet,
  BarChart3,
  Rocket,
  Layers,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { AuthAmbientBg } from './auth-ambient-bg';
import { BrandPreview } from './brand-preview';
import { useI18n } from '@/lib/i18n/provider';

const HIGHLIGHTS: Record<'login' | 'register', { icon: LucideIcon; key: string }[]> = {
  login: [
    { icon: ShieldCheck, key: 'auth.hi1' },
    { icon: Wallet, key: 'auth.hi2' },
    { icon: BarChart3, key: 'auth.hi3' },
  ],
  register: [
    { icon: Rocket, key: 'auth.rhi1' },
    { icon: Layers, key: 'auth.rhi2' },
    { icon: MessageCircle, key: 'auth.rhi3' },
  ],
};

/** The premium branded side of the auth screens (login / register). Pure CSS —
 *  shared ambient background + glass monogram. Self-translates by `variant`.
 *  Hidden on mobile; respects prefers-reduced-motion. */
export function AuthBrandPanel({ variant = 'login' }: { variant?: 'login' | 'register' }) {
  const { t } = useI18n();
  const isRegister = variant === 'register';
  const line1 = isRegister ? t('auth.registerHeadline1') : t('auth.panelHeadline1');
  const line2 = isRegister ? t('auth.registerHeadline2') : t('auth.panelHeadline2');
  const subtext = isRegister ? t('auth.registerPanelSubtext') : t('brand.tagline');

  return (
    <div className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
      <AuthAmbientBg />

      <div className="relative z-10 w-full max-w-md px-12 text-white">
        <h2 className="text-4xl font-bold leading-[1.25]">
          {line1}
          <br />
          {line2}
        </h2>
        <p className="mt-4 leading-relaxed text-white/80">{subtext}</p>

        {/* Product mockup — the creative hero visual */}
        <div className="my-10">
          <BrandPreview />
        </div>

        <ul className="mt-6 space-y-3">
          {HIGHLIGHTS[variant].map((h) => (
            <li key={h.key} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur">
                <h.icon className="h-4 w-4" />
              </span>
              <span className="text-sm text-white/90">{t(h.key)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
