import type { KPIData } from '@/lib/salesTypes';
import { formatSAR, formatNumber, formatPercent } from '@/lib/salesDataUtils';

interface Props {
  kpis: KPIData;
}

const kpiCards = [
  { key: 'totalSales', label: 'Total Sales', icon: '💰', format: formatSAR, color: 'from-emerald-500 to-emerald-600', textColor: 'text-emerald-700' },
  { key: 'totalReturns', label: 'Returns', icon: '🔁', format: formatSAR, color: 'from-red-500 to-red-600', textColor: 'text-red-600' },
  { key: 'returnRate', label: 'Return Rate', icon: '📉', format: formatPercent, color: 'from-orange-500 to-orange-600', textColor: 'text-orange-600' },
  { key: 'uniqueCustomers', label: 'Active Customers', icon: '👥', format: formatNumber, color: 'from-blue-500 to-blue-600', textColor: 'text-blue-700' },
  { key: 'uniqueSKUs', label: 'Active SKUs', icon: '🍫', format: formatNumber, color: 'from-purple-500 to-purple-600', textColor: 'text-purple-700' },
  { key: 'uniqueSalesmen', label: 'Salesmen', icon: '👤', format: formatNumber, color: 'from-indigo-500 to-indigo-600', textColor: 'text-indigo-700' },
  { key: 'transactionCount', label: 'Transactions', icon: '📊', format: formatNumber, color: 'from-teal-500 to-teal-600', textColor: 'text-teal-700' },
  { key: 'avgOrderValue', label: 'Avg Order Value', icon: '📦', format: formatSAR, color: 'from-amber-500 to-amber-600', textColor: 'text-amber-700' },
] as const;

export function SalesKPIGrid({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {kpiCards.map(({ key, label, icon, format, color, textColor }) => (
        <div
          key={key}
          className="relative bg-card rounded-xl border p-3.5 flex flex-col gap-1 overflow-hidden group hover:shadow-md transition-shadow"
        >
          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${color} opacity-80`} />
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
            <span>{icon}</span>
            <span>{label}</span>
          </div>
          <div className={`text-lg font-extrabold ${textColor} tracking-tight`}>
            {format(kpis[key] as number)}
          </div>
        </div>
      ))}
    </div>
  );
}
