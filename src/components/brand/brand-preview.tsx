import { TrendingUp } from 'lucide-react';

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const MESH =
  'radial-gradient(40% 50% at 18% 18%, rgba(192,57,43,0.38), transparent 60%),' +
  'radial-gradient(45% 55% at 82% 22%, rgba(232,176,75,0.16), transparent 60%),' +
  'radial-gradient(70% 60% at 50% 108%, rgba(143,29,46,0.55), transparent 60%),' +
  'linear-gradient(180deg, #1c0710 0%, #120409 100%)';

/** Premium dark auth scene: a maroon mesh gradient with a fading dot grid,
 *  fine grain, glow, particles, and two refined glass cards (gradient borders +
 *  area chart). Language-neutral, pure CSS/SVG. Fills its (relative) parent. */
export function BrandScene() {
  return (
    <>
      {/* mesh gradient */}
      <div className="absolute inset-0" style={{ background: MESH }} />

      {/* fading dot grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          WebkitMaskImage: 'radial-gradient(75% 65% at 50% 38%, #000, transparent)',
          maskImage: 'radial-gradient(75% 65% at 50% 38%, #000, transparent)',
        }}
      />

      {/* animated glows */}
      <div className="ams-aura absolute left-1/2 top-[26%] h-72 w-72 -translate-x-1/2 rounded-full blur-3xl" style={{ background: 'rgba(232,176,75,0.16)' }} />
      <div className="ams-aura-2 absolute -bottom-24 end-4 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(143,29,46,0.5)' }} />

      {/* grain */}
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />

      {/* particles */}
      {[
        ['16%', '24%', 0.55], ['74%', '32%', 0.4], ['38%', '12%', 0.5],
        ['84%', '58%', 0.45], ['26%', '70%', 0.4], ['62%', '80%', 0.5], ['12%', '50%', 0.3],
      ].map(([top, left, o], i) => (
        <span key={i} className="absolute h-1 w-1 rounded-full bg-white" style={{ top, left, opacity: o as number }} />
      ))}

      {/* ── floating glass cards (gradient borders) ── */}
      {/* stat card — top end */}
      <div className="absolute end-10 top-16 hidden rounded-2xl p-px shadow-2xl lg:block" style={{ background: 'linear-gradient(135deg, rgba(232,176,75,0.55), rgba(255,255,255,0.06))' }}>
        <div className="w-44 rounded-2xl bg-[#1b0810]/80 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(232,176,75,0.18)] text-[rgba(232,176,75,0.95)]">
              <TrendingUp className="h-4 w-4" />
            </span>
            <span className="h-1.5 w-10 rounded-full bg-white/12" />
          </div>
          <div className="mt-3 bg-gradient-to-b from-white to-[rgba(232,176,75,0.8)] bg-clip-text text-2xl font-bold tabular-nums text-transparent" dir="ltr">٤٨٫٢ك</div>
          <div className="mt-1 h-1.5 w-16 rounded-full bg-white/12" />
        </div>
      </div>

      {/* area-chart card — bottom start */}
      <div className="absolute start-10 bottom-20 hidden rounded-2xl p-px shadow-2xl lg:block" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(232,176,75,0.40))' }}>
        <div className="w-56 rounded-2xl bg-[#1b0810]/80 p-4 backdrop-blur-xl">
          <div className="mb-1 h-1.5 w-20 rounded-full bg-white/18" />
          <div className="mb-3 h-1.5 w-12 rounded-full bg-white/10" />
          <svg viewBox="0 0 220 80" className="w-full" fill="none" aria-hidden>
            <defs>
              <linearGradient id="ams-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(232,176,75,0.35)" />
                <stop offset="1" stopColor="rgba(232,176,75,0)" />
              </linearGradient>
            </defs>
            <path d="M0,60 C30,52 52,30 84,38 116,46 150,16 220,24 L220,80 L0,80 Z" fill="url(#ams-area)" />
            <path d="M0,60 C30,52 52,30 84,38 116,46 150,16 220,24" stroke="rgba(232,176,75,0.95)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="220" cy="24" r="3.5" fill="#fff" />
          </svg>
        </div>
      </div>

      {/* small floating pill — adds life */}
      <div className="absolute end-16 bottom-28 hidden items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 shadow-xl backdrop-blur-md xl:flex">
        <span className="h-2 w-2 rounded-full" style={{ background: 'rgba(232,176,75,0.9)' }} />
        <span className="h-1.5 w-14 rounded-full bg-white/20" />
      </div>
    </>
  );
}
