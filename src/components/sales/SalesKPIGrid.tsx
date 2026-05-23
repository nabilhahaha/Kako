import type { KPIData } from '@/lib/salesTypes';
import { formatSAR, formatNumber, formatPercent } from '@/lib/salesDataUtils';

interface Props { kpis: KPIData }

const cards = [
  { key: 'totalSales' as const, label: 'Total Sales', format: formatSAR, accent: '#059669', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
  { key: 'totalReturns' as const, label: 'Returns', format: formatSAR, accent: '#dc2626', bg: 'bg-red-50', ring: 'ring-red-200' },
  { key: 'returnRate' as const, label: 'Return Rate', format: formatPercent, accent: '#ea580c', bg: 'bg-orange-50', ring: 'ring-orange-200' },
  { key: 'uniqueCustomers' as const, label: 'Customers', format: formatNumber, accent: '#2563eb', bg: 'bg-blue-50', ring: 'ring-blue-200' },
  { key: 'uniqueSKUs' as const, label: 'SKUs', format: formatNumber, accent: '#7c3aed', bg: 'bg-violet-50', ring: 'ring-violet-200' },
  { key: 'uniqueSalesmen' as const, label: 'Salesmen', format: formatNumber, accent: '#4f46e5', bg: 'bg-indigo-50', ring: 'ring-indigo-200' },
  { key: 'transactionCount' as const, label: 'Transactions', format: formatNumber, accent: '#0891b2', bg: 'bg-cyan-50', ring: 'ring-cyan-200' },
  { key: 'avgOrderValue' as const, label: 'Avg Order', format: formatSAR, accent: '#d97706', bg: 'bg-amber-50', ring: 'ring-amber-200' },
];

export function SalesKPIGrid({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
      {cards.map(({ key, label, format, accent, bg, ring }) => (
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
        </div>
      ))}
    </div>
  );
}
