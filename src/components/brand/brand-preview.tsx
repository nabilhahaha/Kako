import { Home, BarChart3, PieChart, FileText, User, Settings } from 'lucide-react';

/** Decorative auth hero scene (inspired by a modern dark SaaS splash): a deep
 *  brand-dark backdrop with soft glows, particles, flowing wave lines, and
 *  floating glass UI cards (sidebar / line chart / donut / list). Language-
 *  neutral, pure CSS+SVG, no images. Fills its (relative) parent. */
export function BrandScene() {
  return (
    <>
      {/* deep brand-dark gradient */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(125% 100% at 50% -10%, #5e1424 0%, #320c16 46%, #150409 100%)' }}
      />

      {/* soft glows */}
      <div className="absolute left-1/2 top-[28%] h-72 w-72 -translate-x-1/2 rounded-full blur-3xl" style={{ background: 'rgba(232,176,75,0.16)' }} />
      <div className="absolute -bottom-20 end-6 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(143,29,46,0.55)' }} />
      <div className="absolute -top-16 start-0 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(192,57,43,0.30)' }} />

      {/* particles */}
      {[
        ['18%', '22%', 0.6], ['72%', '30%', 0.4], ['40%', '14%', 0.5], ['82%', '60%', 0.5],
        ['28%', '68%', 0.4], ['60%', '78%', 0.6], ['12%', '52%', 0.35], ['90%', '40%', 0.3],
      ].map(([top, left, o], i) => (
        <span key={i} className="absolute h-1 w-1 rounded-full bg-white" style={{ top, left, opacity: o as number }} />
      ))}

      {/* flowing wave lines (bottom) */}
      <svg className="absolute inset-x-0 bottom-0 h-1/2 w-full" viewBox="0 0 600 300" fill="none" preserveAspectRatio="none" aria-hidden>
        {[0, 10, 20, 30, 40, 52].map((d, i) => (
          <path
            key={i}
            d={`M-20 ${190 + d} C 150 ${120 + d}, 320 ${250 + d}, 620 ${150 + d}`}
            stroke="rgba(232,176,75,0.22)"
            strokeWidth="1"
          />
        ))}
      </svg>

      {/* ── floating glass cards ── */}
      {/* sidebar */}
      <div className="absolute start-8 top-1/2 hidden -translate-y-1/2 flex-col gap-3 rounded-2xl border border-white/12 bg-white/[0.06] p-3 shadow-xl backdrop-blur-md xl:flex">
        {[Home, BarChart3, PieChart, FileText, User, Settings].map((Icon, i) => (
          <span
            key={i}
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${i === 0 ? 'bg-[rgba(232,176,75,0.85)] text-[#3a0a13]' : 'text-white/70'}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        ))}
      </div>

      {/* line-chart card (top end) */}
      <div className="absolute end-8 top-14 hidden w-52 rounded-2xl border border-white/12 bg-white/[0.06] p-3 shadow-xl backdrop-blur-md lg:block">
        <div className="mb-1 h-1.5 w-16 rounded-full bg-white/20" />
        <div className="mb-3 h-1.5 w-10 rounded-full bg-white/12" />
        <svg viewBox="0 0 180 70" className="w-full" fill="none">
          <polyline points="4,58 32,46 60,52 92,30 120,38 150,16 176,8" stroke="rgba(232,176,75,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="176" cy="8" r="3.5" fill="#fff" />
        </svg>
      </div>

      {/* donut card (end, lower) */}
      <div className="absolute end-10 bottom-24 hidden w-48 items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] p-3 shadow-xl backdrop-blur-md lg:flex">
        <div className="relative h-12 w-12 shrink-0">
          <div className="absolute inset-0 rounded-full border-[6px] border-white/15" />
          <div className="absolute inset-0 rounded-full border-[6px] border-transparent" style={{ borderTopColor: 'rgba(232,176,75,0.9)', borderInlineEndColor: 'rgba(232,176,75,0.9)', transform: 'rotate(45deg)' }} />
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-white/18" />
          <div className="h-1.5 w-3/4 rounded-full bg-white/12" />
          <div className="h-1.5 w-1/2 rounded-full bg-white/10" />
        </div>
      </div>

      {/* list card (start, lower) */}
      <div className="absolute start-12 bottom-16 hidden w-44 space-y-2.5 rounded-2xl border border-white/12 bg-white/[0.06] p-3 shadow-xl backdrop-blur-md xl:block">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: 'rgba(232,176,75,0.7)' }} />
            <span className="h-1.5 flex-1 rounded-full bg-white/18" />
          </div>
        ))}
      </div>
    </>
  );
}
