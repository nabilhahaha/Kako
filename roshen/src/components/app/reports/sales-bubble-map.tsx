"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";

export type CityPoint = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  sales: number;
  salesLabel: string;
  volume: string;
  invoices: number;
  customers: number;
  distributors: string[];
  mains: string[];
  subs: string[];
  lastActivity: string;
};

export type MapLabels = {
  hint: string; city: string; region: string; sales: string; volume: string;
  invoices: string; customers: string; distributors: string; main: string;
  sub: string; last: string; view: string;
  legend: string; legendSize: string; legendLow: string; legendHigh: string; attr: string;
};

// KSA bounding box (with margin) for a simple equirectangular projection.
const LNG0 = 34, LNG1 = 56, LAT0 = 16, LAT1 = 33;
const px = (lng: number) => ((lng - LNG0) / (LNG1 - LNG0)) * 100;
const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * 100;

// Simplified Saudi Arabia border (lng,lat), projected with the same transform
// so city markers land inside the shape.
const KSA: [number, number][] = [
  [36.6, 29.4], [37.5, 31.0], [38.9, 31.1], [41.0, 31.2], [42.1, 31.1], [44.7, 29.2],
  [46.4, 29.1], [47.5, 28.5], [48.5, 28.5], [49.0, 27.8], [50.2, 26.9], [50.1, 25.6],
  [50.8, 25.0], [51.6, 24.7], [52.6, 22.9], [55.2, 22.6], [55.7, 20.0], [52.0, 19.0],
  [49.0, 18.6], [47.0, 17.5], [44.2, 17.4], [43.2, 16.6], [42.6, 16.4], [41.0, 19.5],
  [39.2, 21.3], [38.0, 24.1], [37.2, 25.9], [36.0, 27.5], [34.8, 28.1], [36.6, 29.4],
];

export function SalesBubbleMap({ cities, labels }: { cities: CityPoint[]; labels: MapLabels }) {
  const [sel, setSel] = useState<string | null>(null);
  const max = Math.max(1, ...cities.map((c) => c.sales));
  const diam = (s: number) => 14 + Math.round(Math.sqrt(s / max) * 32); // 14..46 px
  const tint = (s: number) => {
    const r = s / max;
    if (r > 0.66) return "bg-burgundy";
    if (r > 0.33) return "bg-burgundy/75";
    return "bg-burgundy/50";
  };
  const selected = cities.find((c) => c.id === sel) || null;
  const outline = KSA.map(([lng, lat]) => `${px(lng).toFixed(2)},${py(lat).toFixed(2)}`).join(" ");
  const withSales = cities.filter((c) => c.sales > 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-sky-50 to-cream/50 shadow-sm">
      <div className="relative w-full" style={{ aspectRatio: "6 / 5" }}>
        {/* Saudi outline */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <polygon points={outline} fill="rgba(107,31,46,0.06)" stroke="rgba(107,31,46,0.35)" strokeWidth="0.5" strokeLinejoin="round" />
        </svg>

        <span className="absolute start-3 top-2 font-serif text-sm font-semibold text-burgundy/80">Saudi Arabia</span>

        {/* No-sales muted markers */}
        {cities.filter((c) => c.sales === 0).map((c) => (
          <button key={c.id} type="button" onClick={() => setSel(sel === c.id ? null : c.id)} title={c.name}
            className={"absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-ink/20 hover:bg-ink/40" + (sel === c.id ? " ring-2 ring-burgundy" : "")}
            style={{ left: `${px(c.lng)}%`, top: `${py(c.lat)}%` }} />
        ))}

        {/* Sales bubbles */}
        {withSales.map((c) => {
          const d = diam(c.sales);
          return (
            <button key={c.id} type="button" onClick={() => setSel(sel === c.id ? null : c.id)} title={`${c.name} — ${c.salesLabel}`}
              className={"group absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow-md transition hover:scale-110 " + tint(c.sales) + (sel === c.id ? " ring-2 ring-burgundy ring-offset-1" : "")}
              style={{ left: `${px(c.lng)}%`, top: `${py(c.lat)}%`, width: d, height: d }}>
              <span className="pointer-events-none absolute start-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-white/80 px-1 text-[10px] font-medium text-ink shadow-sm">{c.name}</span>
            </button>
          );
        })}

        {/* Legend */}
        <div className="absolute bottom-2 end-2 rounded-xl border border-line bg-white/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
          <p className="mb-1 font-semibold text-ink">{labels.legend}</p>
          <div className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-burgundy/50" />
            <span className="inline-block h-3 w-3 rounded-full bg-burgundy/75" />
            <span className="inline-block h-4 w-4 rounded-full bg-burgundy" />
            <span className="ms-1 text-muted">{labels.legendSize}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-muted">{labels.legendLow}</span>
            <span className="h-1.5 w-16 rounded-full" style={{ background: "linear-gradient(90deg, rgba(107,31,46,0.4), rgba(107,31,46,1))" }} />
            <span className="text-muted">{labels.legendHigh}</span>
          </div>
        </div>
      </div>

      {/* Selected city detail */}
      {selected && (
        <div className="absolute end-2 top-2 z-10 w-72 rounded-2xl border border-line bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-serif text-base font-semibold text-ink">{selected.name}</p>
              <p className="text-xs text-muted">{selected.region}</p>
            </div>
            <button onClick={() => setSel(null)} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row k={labels.sales} v={selected.salesLabel} strong />
            <Row k={labels.volume} v={selected.volume} />
            <Row k={labels.invoices} v={String(selected.invoices)} />
            <Row k={labels.customers} v={String(selected.customers)} />
            <Row k={labels.distributors} v={selected.distributors.join(", ") || "—"} />
            <Row k={labels.main} v={selected.mains.join(", ") || "—"} />
            <Row k={labels.sub} v={selected.subs.join(", ") || "—"} />
            <Row k={labels.last} v={selected.lastActivity || "—"} />
          </dl>
          {selected.sales > 0 && (
            <Link href={`/reports/sales-map?city=${selected.id}`} className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">
              {labels.view}
            </Link>
          )}
        </div>
      )}

      <p className="border-t border-line/60 px-3 py-1.5 text-[11px] text-muted">{labels.attr}</p>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={"text-end " + (strong ? "font-semibold text-burgundy" : "text-ink")}>{v}</dd>
    </div>
  );
}
