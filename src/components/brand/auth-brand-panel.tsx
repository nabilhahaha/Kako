import { ShieldCheck, Wallet, BarChart3, type LucideIcon } from 'lucide-react';

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
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #6f1624 0%, #8f1d2e 45%, #4d0f1c 100%)' }} />

      <div className="ams-aura absolute -top-24 -left-16 h-96 w-96 rounded-full blur-3xl" style={{ background: 'rgba(232,176,75,0.30)' }} />
      <div className="ams-aura-2 absolute -bottom-20 -right-10 h-[30rem] w-[30rem] rounded-full blur-3xl" style={{ background: 'rgba(255,255,255,0.10)' }} />
      <div className="ams-aura absolute left-1/3 top-1/3 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(192,57,43,0.35)' }} />

      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, transparent 40%, rgba(0,0,0,0.25) 100%)' }} />

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
