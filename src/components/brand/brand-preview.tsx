import {
  TrendingUp, Users, FileText, Stethoscope, UtensilsCrossed, Pill, Scissors, ShoppingBag,
} from 'lucide-react';

/** Decorative, language-neutral hero for the auth brand panel: a translucent
 *  device showing the app placed in a soft "workspace" scene (desk + plant +
 *  light), with the verticals it serves beneath. Pure CSS/SVG — no images. */
export function BrandPreview() {
  return (
    <div className="relative mx-auto w-[24rem] max-w-full select-none" aria-hidden>
      {/* window light */}
      <div className="absolute -end-12 -top-12 -z-10 h-44 w-44 rounded-full blur-3xl" style={{ background: 'rgba(232,176,75,0.30)' }} />

      {/* potted plant (scene prop, behind the device) */}
      <svg className="absolute -start-4 bottom-8 -z-10 h-28 w-20 text-white/15" viewBox="0 0 80 110" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M40 70 C40 50 30 38 18 30" />
        <path d="M40 70 C40 48 52 36 64 30" />
        <path d="M40 72 C40 56 40 44 40 26" />
        <path d="M18 30 C8 24 8 14 14 8 C22 12 24 22 18 30 Z" />
        <path d="M64 30 C74 24 74 14 68 8 C60 12 58 22 64 30 Z" />
        <path d="M40 26 C34 16 38 8 46 4 C50 14 48 22 40 26 Z" />
        <path d="M28 72 h24 l-3 22 a3 3 0 0 1 -3 3 h-12 a3 3 0 0 1 -3 -3 Z" />
      </svg>

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

      {/* laptop base */}
      <div className="flex justify-center">
        <div className="relative h-2.5 w-[27rem] max-w-[116%] rounded-b-2xl border-x border-b border-white/15 bg-white/10 shadow-lg backdrop-blur-md">
          <span className="absolute start-1/2 top-0 h-1 w-16 -translate-x-1/2 rounded-b-lg bg-white/15" />
        </div>
      </div>

      {/* desk surface line */}
      <div className="mx-auto mt-1 h-px w-[30rem] max-w-[128%] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* verticals it serves (brand identity) */}
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
