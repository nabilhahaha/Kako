'use client';

import { useI18n } from '@/lib/i18n/provider';
import { clusterTerritories } from '@/lib/tis/optimize-routes';
import { applyScenario, type Scenario } from '@/lib/tis/scenario';
import { isValidGeo, type TisCustomer, type TisDataset } from '@/lib/tis/dataset';

/** Map "Color by" modes — consistent across every TIS planning surface. */
export type ColorMode = 'route' | 'salesman' | 'coverage' | 'territory' | 'grade' | 'day';
export const ALL_COLOR_MODES: ColorMode[] = ['route', 'salesman', 'coverage', 'territory', 'grade', 'day'];

export const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea'];
export const COVER_HEX: Record<string, string> = { on_track: '#16a34a', under_covered: '#d97706', over_covered: '#2563eb', never_visited: '#dc2626' };
export const GRADE_HEX: Record<string, string> = { a: '#16a34a', b: '#2563eb', c: '#d97706', d: '#dc2626' };
export const DAY_HEX: Record<string, string> = { sun: '#2563eb', mon: '#16a34a', tue: '#d97706', wed: '#7c3aed', thu: '#dc2626', fri: '#0891b2', sat: '#db2777' };
const NEUTRAL = '#cbd5e1';

/** Sorted-id → palette colour map (categorical: salesman / territory cluster). */
export function catColors(ids: (string | null | undefined)[]): Map<string, string> {
  const u = [...new Set(ids.filter((x): x is string => !!x))].sort();
  return new Map(u.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
}

export interface ColorContext {
  routeColor: Map<string, string>;
  salesmanColor: Map<string, string>;
  territoryColor: Map<string, string>; // customerId → colour
  dayOf: Map<string, string | null>;   // customerId → dayOfWeek
}

/** Build the colour context for a dataset under an applied scenario. Pure. */
export function buildColorContext(dataset: TisDataset, scenario: Scenario): ColorContext {
  const applied = applyScenario(dataset, scenario);
  const routeColor = catColors(applied.customers.map((c) => c.ownership.routeId));
  const salesmanColor = catColors(applied.customers.map((c) => c.ownership.salesmanId));
  const terr = clusterTerritories(applied.customers);
  const terrColorByKey = catColors([...terr.values()]);
  const territoryColor = new Map<string, string>();
  for (const [id, key] of terr) territoryColor.set(id, terrColorByKey.get(key) ?? NEUTRAL);
  const dayOf = new Map(scenario.assignments.map((a) => [a.customerId, a.dayOfWeek ?? null]));
  return { routeColor, salesmanColor, territoryColor, dayOf };
}

/** Colour for one customer under a mode. Pure. */
export function colorOf(c: TisCustomer, mode: ColorMode, ctx: ColorContext): string {
  switch (mode) {
    case 'route': return c.ownership.routeId ? ctx.routeColor.get(c.ownership.routeId) ?? NEUTRAL : NEUTRAL;
    case 'salesman': return c.ownership.salesmanId ? ctx.salesmanColor.get(c.ownership.salesmanId) ?? NEUTRAL : NEUTRAL;
    case 'coverage': return c.coverage ? COVER_HEX[c.coverage] ?? NEUTRAL : NEUTRAL;
    case 'territory': return ctx.territoryColor.get(c.id) ?? NEUTRAL;
    case 'grade': return c.grade ? GRADE_HEX[c.grade] ?? NEUTRAL : NEUTRAL;
    case 'day': { const d = ctx.dayOf.get(c.id); return d ? DAY_HEX[d] ?? NEUTRAL : NEUTRAL; }
  }
}

/** Which modes the data supports (others render disabled with a reason). Pure. */
export function modeAvailability(customers: readonly TisCustomer[], ctx: ColorContext): Record<ColorMode, boolean> {
  return {
    route: customers.some((c) => c.ownership.routeId),
    salesman: customers.some((c) => c.ownership.salesmanId),
    coverage: customers.some((c) => c.coverage),
    territory: customers.some((c) => isValidGeo(c.geo)),
    grade: customers.some((c) => c.grade),
    day: customers.some((c) => ctx.dayOf.get(c.id)),
  };
}

/** De-duplicated legend for the active mode. Pure. */
export function legendFor(customers: readonly TisCustomer[], mode: ColorMode, ctx: ColorContext, labels: Record<string, string>, dayLabel: (d: string) => string): { label: string; color: string }[] {
  const seen = new Map<string, string>();
  const put = (key: string, label: string, color: string) => { if (!seen.has(key)) seen.set(key, JSON.stringify({ label, color })); };
  for (const c of customers) {
    if (mode === 'route') { const id = c.ownership.routeId; if (id) put(id, labels[id] ?? id, colorOf(c, mode, ctx)); }
    else if (mode === 'salesman') { const id = c.ownership.salesmanId; if (id) put(id, labels[id] ?? id, colorOf(c, mode, ctx)); }
    else if (mode === 'coverage') { const k = c.coverage; if (k) put(k, k.replace(/_/g, ' '), colorOf(c, mode, ctx)); }
    else if (mode === 'territory') { const k = ctx.territoryColor.get(c.id); if (k) put(k, '', k); }
    else if (mode === 'grade') { const k = c.grade; if (k) put(k, k.toUpperCase(), colorOf(c, mode, ctx)); }
    else { const d = ctx.dayOf.get(c.id); if (d) put(d, dayLabel(d), colorOf(c, mode, ctx)); }
  }
  const out = [...seen.values()].map((v) => JSON.parse(v) as { label: string; color: string });
  return mode === 'territory' ? out.map((o, i) => ({ label: `T${i + 1}`, color: o.color })).slice(0, 16) : out.slice(0, 16);
}

/**
 * "Color by" control — ALWAYS shows every mode; unavailable ones are disabled with a
 * short reason (never silently hidden). Shared by Studio, New Optimization, the board,
 * and the Journey Builder for a consistent experience.
 */
export function ColorByControl({ modes, value, available, onChange }: {
  modes: ColorMode[]; value: ColorMode; available: Record<ColorMode, boolean>; onChange: (m: ColorMode) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t('planBoard.colorBy')}:</span>
      {modes.map((m) => {
        const ok = available[m];
        return (
          <button key={m} disabled={!ok} onClick={() => ok && onChange(m)} title={ok ? '' : t(`planBoard.colorNA_${m}`)}
            className={`rounded-md border px-2.5 py-1 text-xs ${value === m && ok ? 'bg-secondary font-medium' : ok ? 'hover:bg-muted' : 'cursor-not-allowed opacity-45'}`}>
            {t(`planBoard.color_${m}`)}
          </button>
        );
      })}
    </div>
  );
}

export function MapLegend({ items }: { items: { label: string; color: string }[] }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
      <span className="text-muted-foreground">{t('planBoard.legend')}:</span>
      {items.map((l) => (
        <span key={l.label + l.color} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />{l.label}</span>
      ))}
    </div>
  );
}
