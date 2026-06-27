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
};

// KSA bounding box (with margin) for a simple equirectangular projection.
const LNG0 = 34, LNG1 = 56, LAT0 = 16, LAT1 = 33;
const px = (lng: number) => ((lng - LNG0) / (LNG1 - LNG0)) * 100;
const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * 100;

export function SalesBubbleMap({ cities, labels }: { cities: CityPoint[]; labels: MapLabels }) {
  const [sel, setSel] = useState<string | null>(null);
  const max = Math.max(1, ...cities.map((c) => c.sales));
  const radius = (s: number) => 9 + Math.round(Math.sqrt(s / max) * 30); // 9..39 px
  const tint = (s: number) => {
    const r = s / max;
    if (r === 0) return "bg-cream-deep/70 text-muted";
    if (r > 0.66) return "bg-burgundy text-cream";
    if (r > 0.33) return "bg-burgundy/70 text-cream";
    return "bg-burgundy/40 text-cream";
  };
  const selected = cities.find((c) => c.id === sel) || null;

  return (
    <div className="relative">
      <div className="relative w-full overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-sky-50/60 to-cream/40" style={{ aspectRatio: "16 / 11" }}>
        <span className="absolute start-3 top-2 text-[11px] font-medium uppercase tracking-wide text-muted">Saudi Arabia</span>
        <p className="absolute bottom-2 start-3 text-[11px] text-muted">{labels.hint}</p>

        {cities.map((c) => {
          const d = radius(c.sales);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSel(sel === c.id ? null : c.id)}
              title={`${c.name} — ${c.salesLabel}`}
              className={"absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 shadow-sm transition hover:ring-2 hover:ring-burgundy/40 " + tint(c.sales) + (sel === c.id ? " ring-2 ring-burgundy" : "")}
              style={{ left: `${px(c.lng)}%`, top: `${py(c.lat)}%`, width: d, height: d }}
            >
              <span className="pointer-events-none absolute start-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-ink/80">{c.name}</span>
            </button>
          );
        })}
      </div>

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
          <Link href={`/reports/sales-map?city=${selected.id}`} className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">
            {labels.view}
          </Link>
        </div>
      )}
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
