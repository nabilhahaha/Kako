import { LayoutGrid, BarChart3, Users, Wallet, TrendingUp, Search } from 'lucide-react';

const M = '#6366f1';

/** A detailed light-theme app window mockup — the product shot. Presentational
 *  (no hooks), language-neutral, pure CSS/SVG. */
export function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-4xl" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-60 blur-3xl" style={{ background: 'radial-gradient(60% 60% at 50% 30%, rgba(124,58,237,0.35), transparent 70%)' }} />

      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl ring-1 ring-black/5">
        {/* browser chrome */}
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <div className="ms-4 hidden h-6 max-w-xs flex-1 items-center gap-2 rounded-md bg-white px-3 text-[11px] text-neutral-400 ring-1 ring-neutral-200 sm:flex" dir="ltr">
            <Search className="h-3 w-3" /> app.vantora.com/dashboard
          </div>
        </div>

        <div className="flex">
          {/* sidebar */}
          <aside className="hidden w-44 shrink-0 border-e border-neutral-100 bg-neutral-50/70 p-3 md:block">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: M }} dir="ltr">V</span>
              <span className="h-2.5 w-16 rounded-full bg-neutral-200" />
            </div>
            {[LayoutGrid, BarChart3, Wallet, Users].map((Icon, i) => (
              <div key={i} className={`mb-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${i === 0 ? 'text-white' : 'text-neutral-500'}`} style={i === 0 ? { background: M } : undefined}>
                <Icon className="h-4 w-4" />
                <span className={`h-2 w-14 rounded-full ${i === 0 ? 'bg-white/60' : 'bg-neutral-200'}`} />
              </div>
            ))}
          </aside>

          {/* main */}
          <div className="flex-1 space-y-4 p-4 sm:p-5">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: TrendingUp, v: '48.2K', l: 'Sales' },
                { icon: Wallet, v: '12.4K', l: 'Profit' },
                { icon: Users, v: '1,320', l: 'Customers' },
                { icon: BarChart3, v: '267', l: 'Orders' },
              ].map((k, i) => (
                <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'rgba(124,58,237,0.10)', color: M }}>
                    <k.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="mt-2 text-base font-bold text-neutral-800" dir="ltr">{k.v}</div>
                  <div className="text-[11px] text-neutral-400" dir="ltr">{k.l}</div>
                </div>
              ))}
            </div>

            {/* chart + donut */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-neutral-100 bg-white p-4 lg:col-span-2">
                <div className="mb-3 h-2 w-24 rounded-full bg-neutral-200" />
                <svg viewBox="0 0 320 110" className="w-full" fill="none" aria-hidden>
                  <defs>
                    <linearGradient id="ams-dash-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="rgba(124,58,237,0.22)" />
                      <stop offset="1" stopColor="rgba(124,58,237,0)" />
                    </linearGradient>
                  </defs>
                  <path d="M0,86 C40,78 70,48 110,56 150,64 190,24 230,34 270,42 300,18 320,22 L320,110 L0,110 Z" fill="url(#ams-dash-area)" />
                  <path d="M0,86 C40,78 70,48 110,56 150,64 190,24 230,34 270,42 300,18 320,22" stroke={M} strokeWidth="2.5" strokeLinecap="round" />
                  {[[110, 56], [230, 34], [320, 22]].map(([cx, cy], i) => (
                    <circle key={i} cx={cx} cy={cy} r="3" fill="#fff" stroke={M} strokeWidth="2" />
                  ))}
                </svg>
              </div>
              <div className="flex items-center justify-center gap-3 rounded-xl border border-neutral-100 bg-white p-4">
                <div className="relative h-20 w-20">
                  <div className="absolute inset-0 rounded-full border-[9px] border-neutral-100" />
                  <div className="absolute inset-0 rounded-full border-[9px] border-transparent" style={{ borderTopColor: M, borderInlineEndColor: M, transform: 'rotate(30deg)' }} />
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-neutral-700" dir="ltr">72%</div>
                </div>
              </div>
            </div>

            {/* table */}
            <div className="rounded-xl border border-neutral-100 bg-white p-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50">
                  <span className="h-7 w-7 shrink-0 rounded-full bg-neutral-200" />
                  <div className="flex-1">
                    <div className="h-2 w-32 rounded-full bg-neutral-200" />
                    <div className="mt-1 h-2 w-20 rounded-full bg-neutral-100" />
                  </div>
                  <span className="hidden h-2 w-20 rounded-full bg-neutral-100 sm:block" />
                  <span className="h-5 w-14 rounded-full" style={{ background: i % 3 === 0 ? 'rgba(22,163,74,0.14)' : 'rgba(124,58,237,0.10)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
