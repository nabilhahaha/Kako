import type { KPIData } from '@/lib/salesTypes';
import { formatSAR, formatNumber, formatPercent } from '@/lib/salesDataUtils';

interface Props {
  kpis: KPIData;
  previousKpis?: KPIData | null;
  currentPeriodKpis?: KPIData | null;
}

const cards = [
  { key: 'totalSales' as const, label: 'Total Sales', format: formatSAR, accent: '#059669', bg: 'bg-emerald-50', ring: 'ring-emerald-200', higherIsBetter: true },
  { key: 'totalReturns' as const, label: 'Returns', format: formatSAR, accent: '#dc2626', bg: 'bg-red-50', ring: 'ring-red-200', higherIsBetter: false },
  { key: 'returnRate' as const, label: 'Return Rate', format: formatPercent, accent: '#ea580c', bg: 'bg-orange-50', ring: 'ring-orange-200', higherIsBetter: false },
  { key: 'uniqueCustomers' as const, label: 'Customers', format: formatNumber, accent: '#2563eb', bg: 'bg-blue-50', ring: 'ring-blue-200', higherIsBetter: true },
  { key: 'uniqueSKUs' as const, label: 'SKUs', format: formatNumber, accent: '#7c3aed', bg: 'bg-violet-50', ring: 'ring-violet-200', higherIsBetter: true },
  { key: 'uniqueSalesmen' as const, label: 'Salesmen', format: formatNumber, accent: '#4f46e5', bg: 'bg-indigo-50', ring: 'ring-indigo-200', higherIsBetter: true },
  { key: 'transactionCount' as const, label: 'Transactions', format: formatNumber, accent: '#0891b2', bg: 'bg-cyan-50', ring: 'ring-cyan-200', higherIsBetter: true },
  { key: 'avgOrderValue' as const, label: 'Avg Order', format: formatSAR, accent: '#d97706', bg: 'bg-amber-50', ring: 'ring-amber-200', higherIsBetter: true },
];

function computeDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function SalesKPIGrid({ kpis, previousKpis, currentPeriodKpis }: Props) {
  // Use currentPeriodKpis for comparison when available (no-date-filter case),
  // otherwise use kpis (which already represents the current period when date filter is set)
  const comparisonCurrent = currentPeriodKpis ?? kpis;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
      {cards.map(({ key, label, format, accent, bg, ring, higherIsBetter }) => {
        const delta = previousKpis
          ? computeDelta(comparisonCurrent[key], previousKpis[key])
          : null;

        const isPositive = delta !== null && delta > 0;
        const isNegative = delta !== null && delta < 0;
        const isImproved = higherIsBetter ? isPositive : isNegative;
        const isDegraded = higherIsBetter ? isNegative : isPositive;

        return (
          <div
            key={key}
            className={`relative dash-card p-4 ring-1 ${ring} ${bg} overflow-hidden group`}
          >
            <div
              className="absolute top-0 left-0 w-full h-[3px]"
              style={{ background: accent }}
            />
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              {label}
            </p>
            <p
              className="text-[18px] font-extrabold tracking-tight"
              style={{ color: accent }}
            >
              {format(kpis[key])}
            </p>
            {/* Delta indicator */}
            {delta !== null ? (
              <p
                className="text-[11px] font-semibold mt-1 leading-tight"
                style={{
                  color: isImproved ? '#059669' : isDegraded ? '#dc2626' : '#94a3b8',
                }}
              >
                {isPositive ? '▲' : isNegative ? '▼' : '—'}{' '}
                {Math.abs(delta).toFixed(1)}%
              </p>
            ) : previousKpis ? (
              <p className="text-[11px] font-semibold mt-1 leading-tight text-slate-400">
                —
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
