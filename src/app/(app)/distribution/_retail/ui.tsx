import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { complianceBand } from '@/lib/erp/assortment';
import type { RollupRow } from '@/lib/erp/retail-rollup';

// Shared, server-rendered dashboard primitives — used by every executive retail
// dashboard so the drill UI + rollup table exist once (no duplication).

const bandVariant = (pct: number) => {
  const b = complianceBand(pct);
  return b === 'good' ? 'success' : b === 'attention' ? 'warning' : 'destructive';
};

/** Drill-by chips. `dims` is the dynamic dimension list (label already resolved). */
export function DimensionTabs({ basePath, dims, current }: { basePath: string; dims: { key: string; label: string }[]; current: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {dims.map((d) => (
        <Link
          key={d.key}
          href={`${basePath}?dim=${encodeURIComponent(d.key)}`}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            d.key === current ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:border-primary/60'
          }`}
        >
          {d.label}
        </Link>
      ))}
    </div>
  );
}

/** Generic compliance rollup table (label · outlets · compliance · weighted · gap). */
export function RollupTable({ rows, cols }: {
  rows: RollupRow[];
  cols: { dimension: string; outlets: string; compliance: string; weighted: string; gap: string };
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{cols.dimension}</th>
            <th className="px-3 py-2 text-end font-medium">{cols.outlets}</th>
            <th className="px-3 py-2 text-end font-medium">{cols.compliance}</th>
            <th className="px-3 py-2 text-end font-medium">{cols.weighted}</th>
            <th className="px-3 py-2 text-end font-medium">{cols.gap}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="px-3 py-2">{r.label}</td>
              <td className="px-3 py-2 text-end tabular-nums">{r.outlets}</td>
              <td className="px-3 py-2 text-end"><Badge variant={bandVariant(r.compliancePct)}>{r.compliancePct}%</Badge></td>
              <td className="px-3 py-2 text-end tabular-nums">{r.weightedPct}%</td>
              <td className="px-3 py-2 text-end tabular-nums text-destructive">{r.gapLines}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyCard({ text }: { text: string }) {
  return <Card><CardContent className="p-8 text-center text-muted-foreground">{text}</CardContent></Card>;
}

/** Resolve a dimension key to a display label (fixed dims localized; dynamic
 *  company lookup kinds shown as their kind, title-cased). */
export function dimLabel(key: string, t: (k: string) => string): string {
  const known = ['region', 'area', 'supervisor', 'salesman', 'customer', 'brand', 'sku', 'grade'];
  if (known.includes(key)) return t(`retail.dash.dims.${key}`);
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
