import {
  TrendingUp, Users, FileText, Stethoscope, UtensilsCrossed, Pill, Scissors, ShoppingBag,
} from 'lucide-react';

/** Decorative, language-neutral hero for the auth brand panel: a translucent
 *  laptop showing the app (KPI tiles + lists + a soft ring — no bar chart),
 *  with a strip of the verticals it serves beneath it. Pure CSS, no images. */
export function BrandPreview() {
  return (
    <div className="relative mx-auto w-[23rem] max-w-full select-none" aria-hidden>
      {/* soft accent glow behind the device */}
      <div className="absolute -end-10 -top-10 -z-10 h-36 w-36 rounded-full blur-3xl" style={{ background: 'rgba(232,176,75,0.28)' }} />

      {/* ── Laptop screen ── */}
      <div className="rounded-t-2xl border border-white/15 bg-white/[0.06] p-2.5 shadow-2xl backdrop-blur-md">
        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.05]">
          {/* app top bar */}
          <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-white/35" />
            <span className="h-2 w-2 rounded-full bg-white/25" />
            <span className="h-2 w-2 rounded-full bg-white/25" />
            <span className="ms-2 h-1.5 w-20 rounded-full bg-white/15" />
            <span className="ms-auto h-4 w-4 rounded-md bg-white/12" />
          </div>

          {/* app body: sidebar + content */}
          <div className="flex gap-3 p-3">
            <div className="hidden w-11 shrink-0 space-y-2 sm:block">
              <div className="h-5 w-full rounded-md bg-white/15" />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-2 w-full rounded-full bg-white/10" />
              ))}
            </div>

            <div className="flex-1 space-y-3">
              {/* KPI tiles */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: TrendingUp, v: '٤٨٫٢ك' },
                  { icon: Users, v: '١٬٣٢٠' },
                  { icon: FileText, v: '٢٦٧' },
                ].map((k, i) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-white/10 p-2">
                    <k.icon className="h-3.5 w-3.5 text-white/70" />
                    <div className="mt-1.5 text-xs font-bold tabular-nums text-white/90" dir="ltr">{k.v}</div>
                    <div className="mt-1 h-1 w-8 rounded-full bg-white/20" />
                  </div>
                ))}
              </div>

              {/* list panel + soft ring (no chart) */}
              <div className="flex gap-3">
                <div className="flex-1 space-y-2.5 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="h-5 w-5 shrink-0 rounded-full bg-white/15" />
                      <div className="flex-1">
                        <div className="h-1.5 w-20 rounded-full bg-white/20" />
                        <div className="mt-1 h-1.5 w-12 rounded-full bg-white/10" />
                      </div>
                      <span className="h-3 w-8 rounded-full" style={{ background: 'rgba(232,176,75,0.30)' }} />
                    </div>
                  ))}
                </div>
                <div className="flex w-[4.5rem] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                  <div
                    className="h-12 w-12 rounded-full border-[5px] border-white/15"
                    style={{ borderTopColor: 'rgba(232,176,75,0.75)', borderInlineEndColor: 'rgba(232,176,75,0.75)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Laptop base (wider than the screen) ── */}
      <div className="flex justify-center">
        <div className="relative h-2.5 w-[26.5rem] max-w-[116%] rounded-b-2xl border-x border-b border-white/15 bg-white/10 shadow-lg backdrop-blur-md">
          <span className="absolute start-1/2 top-0 h-1 w-16 -translate-x-1/2 rounded-b-lg bg-white/15" />
        </div>
      </div>

      {/* ── Verticals it serves (brand identity strip) ── */}
      <div className="mt-7 flex items-center justify-center gap-2.5">
        {[Stethoscope, UtensilsCrossed, Pill, Scissors, ShoppingBag].map((Icon, i) => (
          <span key={i} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/10 text-white/85 backdrop-blur">
            <Icon className="h-4 w-4" />
          </span>
        ))}
      </div>
    </div>
  );
}
