import { ShieldCheck, Wallet, BarChart3, type LucideIcon } from 'lucide-react';
import { AuthAmbientBg } from './auth-ambient-bg';

const DEFAULT_HIGHLIGHTS = [
  { icon: ShieldCheck, text: 'بياناتك معزولة وآمنة بالكامل' },
  { icon: Wallet, text: 'محاسبة تلقائية متكاملة' },
  { icon: BarChart3, text: 'تقارير ومؤشرات لحظية' },
];

/** The premium branded side of the auth screens (login / register). Pure CSS —
 *  layered brand gradient, animated aurora, dot grid + vignette, glass monogram.
 *  Hidden on mobile; respects prefers-reduced-motion. */
export function AuthBrandPanel({
  headline,
  subtext = 'عيادات، مطاعم، صيدليات، صالونات، ومحلات — كل نشاط بأدواته، في مكان واحد محترف وآمن.',
  highlights = DEFAULT_HIGHLIGHTS,
}: {
  headline?: React.ReactNode;
  subtext?: string;
  highlights?: { icon: LucideIcon; text: string }[];
}) {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
      <AuthAmbientBg />

      <div className="relative z-10 max-w-md px-12 text-white">
        <div className="mb-9 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-xl font-bold tracking-tight shadow-lg backdrop-blur" dir="ltr">
          AMS
        </div>

        <h2 className="text-4xl font-bold leading-[1.25]">
          {headline ?? (<>نظام واحد<br />يدير أعمالك كلها</>)}
        </h2>
        <p className="mt-4 leading-relaxed text-white/80">{subtext}</p>

        <ul className="mt-10 space-y-3">
          {highlights.map((h) => (
            <li key={h.text} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur">
                <h.icon className="h-4 w-4" />
              </span>
              <span className="text-sm text-white/90">{h.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
