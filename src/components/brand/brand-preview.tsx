import { TrendingUp, Users, FileText, Stethoscope, UtensilsCrossed, Pill, Scissors, ShoppingBag } from 'lucide-react';

/** A purely decorative, language-neutral product mockup shown on the auth brand
 *  panel — a floating "mini dashboard" that signals this is a business
 *  management system, plus a strip of the verticals it adapts to. No real data,
 *  no i18n; just chic depth. */
export function BrandPreview() {
  return (
    <div className="relative mx-auto w-[22rem] max-w-full select-none" aria-hidden>
      {/* Main glass dashboard card */}
      <div className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
        {/* window chrome */}
        <div className="mb-4 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
          <span className="ms-2 h-2 w-24 rounded-full bg-white/15" />
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { icon: TrendingUp, v: '٤٨٫٢ك' },
            { icon: Users, v: '١٬٣٢٠' },
            { icon: FileText, v: '٢٦٧' },
          ].map((k, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/10 p-2.5">
              <k.icon className="h-4 w-4 text-white/80" />
              <div className="mt-2 text-sm font-bold tabular-nums" dir="ltr">{k.v}</div>
              <div className="mt-1.5 h-1 w-10 rounded-full bg-white/20" />
            </div>
          ))}
        </div>

        {/* mini bar chart */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-3 h-1.5 w-16 rounded-full bg-white/15" />
          <div className="flex h-20 items-end gap-2">
            {[42, 64, 38, 78, 56, 88, 70].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: i === 5 ? 'rgba(232,176,75,0.85)' : 'rgba(255,255,255,0.30)' }} />
            ))}
          </div>
        </div>

        {/* list rows */}
        <div className="mt-3 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="h-7 w-7 shrink-0 rounded-full bg-white/15" />
              <div className="flex-1">
                <div className="h-1.5 w-24 rounded-full bg-white/25" />
                <div className="mt-1.5 h-1.5 w-16 rounded-full bg-white/12" />
              </div>
              <span className="h-4 w-12 rounded-full bg-[rgba(232,176,75,0.30)]" />
            </div>
          ))}
        </div>
      </div>

      {/* Floating "verticals" chip card for depth */}
      <div className="absolute -bottom-5 -start-6 flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 shadow-xl backdrop-blur-md">
        {[Stethoscope, UtensilsCrossed, Pill, Scissors, ShoppingBag].map((Icon, i) => (
          <span key={i} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/85">
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
      </div>

      {/* small accent glow behind the card */}
      <div className="absolute -end-8 -top-8 -z-10 h-32 w-32 rounded-full blur-2xl" style={{ background: 'rgba(232,176,75,0.35)' }} />
    </div>
  );
}
