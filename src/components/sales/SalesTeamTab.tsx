import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { SalesmanPerformance } from '@/lib/salesTypes';
import { formatSAR, formatNumber } from '@/lib/salesDataUtils';

const sarFormatter = (value: unknown) => [formatSAR(Number(value)), 'Sales'];

interface Props {
  salesmanPerformance: SalesmanPerformance[];
}

export function SalesTeamTab({ salesmanPerformance }: Props) {
  const top20 = salesmanPerformance.slice(0, 20);

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">👤 Top 20 Salesmen by Revenue</h3>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top20} layout="vertical">
              <XAxis
                type="number"
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
              />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
              <Tooltip
                formatter={sarFormatter}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="sales" fill="#3B82F6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-bold text-foreground">📋 Full Sales Team</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-start px-4 py-2 font-semibold">#</th>
                <th className="text-start px-4 py-2 font-semibold">Salesman</th>
                <th className="text-end px-4 py-2 font-semibold">Sales (SAR)</th>
                <th className="text-end px-4 py-2 font-semibold">Qty</th>
                <th className="text-end px-4 py-2 font-semibold">Customers</th>
                <th className="text-end px-4 py-2 font-semibold">Orders</th>
                <th className="text-end px-4 py-2 font-semibold">Avg Order</th>
              </tr>
            </thead>
            <tbody>
              {salesmanPerformance.map((sm, idx) => (
                <tr key={sm.name} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2 font-medium">{sm.name}</td>
                  <td className="px-4 py-2 text-end font-mono text-emerald-600">{formatSAR(sm.sales)}</td>
                  <td className="px-4 py-2 text-end font-mono">{formatNumber(sm.qty)}</td>
                  <td className="px-4 py-2 text-end">{sm.customers}</td>
                  <td className="px-4 py-2 text-end">{formatNumber(sm.invoices)}</td>
                  <td className="px-4 py-2 text-end font-mono">{formatSAR(sm.avgOrderValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
