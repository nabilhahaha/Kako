import type { KPIData } from '@/lib/salesTypes';
import { formatSAR, formatNumber, formatPercent } from '@/lib/salesDataUtils';

interface Props {
  kpis: KPIData;
}

const kpiCards = [
  { key: 'totalSales', label: 'Total Sales', icon: '💰', format: formatSAR, color: 'text-emerald-600' },
  { key: 'totalReturns', label: 'Returns', icon: '🔁', format: formatSAR, color: 'text-red-500' },
  { key: 'returnRate', label: 'Return Rate', icon: '📉', format: formatPercent, color: 'text-orange-500' },
  { key: 'uniqueCustomers', label: 'Customers', icon: '👥', format: formatNumber, color: 'text-blue-600' },
  { key: 'uniqueSKUs', label: 'Active SKUs', icon: '🍫', format: formatNumber, color: 'text-purple-600' },
  { key: 'uniqueSalesmen', label: 'Salesmen', icon: '👤', format: formatNumber, color: 'text-indigo-600' },
  { key: 'transactionCount', label: 'Transactions', icon: '📊', format: formatNumber, color: 'text-teal-600' },
  { key: 'avgOrderValue', label: 'Avg Order', icon: '📦', format: formatSAR, color: 'text-amber-600' },
] as const;

export function SalesKPIGrid({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpiCards.map(({ key, label, icon, format, color }) => (
        <div
          key={key}
          className="bg-card rounded-xl border p-4 flex flex-col gap-1"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <span>{icon}</span>
            <span>{label}</span>
          </div>
          <div className={`text-lg font-bold ${color}`}>
            {format(kpis[key] as number)}
          </div>
        </div>
      ))}
    </div>
  );
}
