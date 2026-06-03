'use client';

import { useI18n } from '@/lib/i18n/provider';

/** ── Tiny inline chart primitives (no charting dependency) ──────────────────
 *  Purpose-built, dependency-free SVG/CSS bars + a sparkline for the Platform
 *  Analytics dashboard. recharts IS available in the project, but these surfaces
 *  are small, mobile-first and stack vertically, so lightweight inline shapes
 *  read better and ship zero extra JS. All visuals are RTL-safe (logical CSS;
 *  the sparkline mirrors under [dir=rtl]). */

export interface SeriesPoint {
  /** Pre-localised short label (e.g. month name). */
  label: string;
  value: number;
}

/** Vertical bars + an overlaid sparkline for a short time-series (growth). */
export function GrowthChart({ points, unit }: { points: SeriesPoint[]; unit: string }) {
  const { locale } = useI18n();
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((s, p) => s + p.value, 0);

  // Sparkline geometry (viewBox is unitless; CSS scales it responsively).
  const w = 100;
  const h = 28;
  const n = points.length;
  const stepX = n > 1 ? w / (n - 1) : 0;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = h - (p.value / max) * h;
    return [x, y] as const;
  });
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  const fmt = (v: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en').format(v);

  return (
    <div>
      {/* Sparkline trend (decorative overview of the same series). */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="mb-4 h-8 w-full text-primary rtl:-scale-x-100"
        role="presentation"
        aria-hidden="true"
      >
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Bars: large touch targets, no horizontal scroll (they flex to fit). */}
      <div className="flex items-end gap-1.5" style={{ minHeight: 96 }}>
        {points.map((p, i) => {
          const pct = Math.round((p.value / max) * 100);
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium tabular-nums text-muted-foreground">{fmt(p.value)}</span>
              <div
                className="w-full rounded-t-md bg-primary/80"
                style={{ height: Math.max(4, (pct / 100) * 72) }}
                title={`${p.label}: ${fmt(p.value)} ${unit}`}
              />
              <span className="w-full truncate text-center text-[10px] text-muted-foreground">{p.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{fmt(total)}</span> {unit}
      </p>
    </div>
  );
}

export interface RankedItem {
  label: string;
  value: number;
  /** Optional Tailwind class for the bar fill (defaults to primary). */
  barClassName?: string;
}

/** Horizontal ranked bar list (subscription mix, modules, business types). */
export function RankedBars({ items, unit }: { items: RankedItem[]; unit: string }) {
  const { locale } = useI18n();
  const max = Math.max(1, ...items.map((i) => i.value));
  const fmt = (v: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en').format(v);

  return (
    <ul className="space-y-3">
      {items.map((it, i) => {
        const pct = Math.round((it.value / max) * 100);
        return (
          <li key={i}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{it.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {fmt(it.value)} <span className="text-xs">{unit}</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={it.barClassName ?? 'h-full rounded-full bg-primary'}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
