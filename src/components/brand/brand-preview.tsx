import { TrendingUp, Users, FileText, Search } from 'lucide-react';

const M = '#0f2c52'; // brand maroon

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Translucent "ruby glass" maroon backdrop: a lighter jewel gradient with a
 *  diagonal glass sheen, a top frosted highlight, soft glow and fine grain. */
export function BrandBg() {
  return (
    <>
      {/* jewel gradient (lighter, more translucent feel) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(95% 70% at 50% -12%, rgba(255,255,255,0.30), transparent 55%),' +
            'radial-gradient(55% 50% at 85% 18%, rgba(34,211,238,0.22), transparent 60%),' +
            'linear-gradient(155deg, #0f2c52 0%, #5b4ee6 52%, #3b2db0 100%)',
        }}
      />
      {/* diagonal glass sheen (light reflecting on a pane) */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(115deg, transparent 26%, rgba(255,255,255,0.14) 45%, rgba(255,255,255,0) 60%)' }}
      />
      {/* top frosted highlight + glass edge on the start side */}
      <div className="absolute inset-x-0 top-0 h-1/3" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.12), transparent)' }} />
      <div className="absolute inset-y-0 start-0 w-px" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.25), transparent)' }} />

      <div className="ams-aura absolute -bottom-24 -start-16 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(34,211,238,0.20)' }} />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
    </>
  );
}

/** A realistic light-theme product mockup of the app — the hero visual. Shows
 *  the product itself (sidebar + KPIs + area chart + table) so the splash reads
 *  premium and authentic. Language-neutral, pure CSS/SVG. */
export function ProductMockup() {
  return (
    <div className="relative" aria-hidden>
      {/* glow + floor reflection under the card */}
      <div className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-2xl" style={{ background: 'radial-gradient(60% 60% at 50% 40%, rgba(34,211,238,0.35), transparent 70%)' }} />

      <div
        className="w-[27rem] max-w-full overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
        style={{ transform: 'perspective(1400px) rotateY(-9deg) rotateX(4deg)' }}
      >
        {/* top bar */}
        <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
          <div className="ms-3 flex h-6 flex-1 items-center gap-1.5 rounded-md bg-neutral-100 px-2 text-neutral-400">
            <Search className="h-3 w-3" />
            <span className="h-1.5 w-20 rounded-full bg-neutral-200" />
          </div>
          <span className="h-6 w-6 rounded-full" style={{ background: M }} />
        </div>

        <div className="flex">
          {/* sidebar */}
          <div className="w-14 shrink-0 space-y-2 border-e border-neutral-100 bg-neutral-50 p-2">
            <div className="h-7 w-full rounded-lg" style={{ background: M }} />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-2.5 w-full rounded-md bg-neutral-200" />
            ))}
          </div>

          {/* content */}
          <div className="flex-1 space-y-3 p-4">
            {/* header */}
            <div className="flex items-center justify-between">
              <div className="h-2.5 w-28 rounded-full bg-neutral-200" />
              <div className="h-6 w-16 rounded-md" style={{ background: M }} />
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { icon: TrendingUp, v: '48.2K' },
                { icon: Users, v: '1,320' },
                { icon: FileText, v: '267' },
              ].map((k, i) => (
                <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 p-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: 'rgba(124,58,237,0.10)', color: M }}>
                    <k.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="mt-2 text-sm font-bold tabular-nums text-neutral-800" dir="ltr">{k.v}</div>
                  <div className="mt-1 h-1 w-8 rounded-full bg-neutral-200" />
                </div>
              ))}
            </div>

            {/* area chart */}
            <div className="rounded-xl border border-neutral-100 bg-white p-3">
              <div className="mb-2 h-1.5 w-20 rounded-full bg-neutral-200" />
              <svg viewBox="0 0 240 70" className="w-full" fill="none" aria-hidden>
                <defs>
                  <linearGradient id="ams-mk-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="rgba(124,58,237,0.22)" />
                    <stop offset="1" stopColor="rgba(124,58,237,0)" />
                  </linearGradient>
                </defs>
                <path d="M0,52 C32,46 54,26 88,32 122,38 156,12 240,20 L240,70 L0,70 Z" fill="url(#ams-mk-area)" />
                <path d="M0,52 C32,46 54,26 88,32 122,38 156,12 240,20" stroke={M} strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="240" cy="20" r="3.5" fill={M} />
              </svg>
            </div>

            {/* table rows */}
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-neutral-200" />
                  <div className="flex-1">
                    <div className="h-1.5 w-24 rounded-full bg-neutral-200" />
                    <div className="mt-1 h-1.5 w-14 rounded-full bg-neutral-100" />
                  </div>
                  <span className="h-4 w-12 rounded-full" style={{ background: i === 0 ? 'rgba(22,163,74,0.15)' : 'rgba(124,58,237,0.10)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
