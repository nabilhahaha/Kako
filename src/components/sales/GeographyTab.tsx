import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import type { RegionSales } from '@/lib/salesTypes';
import { formatSAR, formatNumber } from '@/lib/salesDataUtils';

const COLORS = ['#DC2626', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

interface Props {
  regionSales: RegionSales[];
}

export function GeographyTab({ regionSales }: Props) {
  const totalSales = regionSales.reduce((sum, r) => sum + r.sales, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">🌍 Revenue by Region</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionSales} layout="vertical">
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 10 }} width={130} />
                <Tooltip
                  formatter={(value: number) => [formatSAR(value), 'Sales']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                  {regionSales.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-xl border p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">📊 Customer Distribution</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={regionSales}
                  dataKey="customers"
                  nameKey="region"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ region, percent }: { region: string; percent: number }) =>
                    `${region} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={{ strokeWidth: 1 }}
                >
                  {regionSales.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-bold text-foreground">📋 Region Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-start px-4 py-2 font-semibold">Region</th>
                <th className="text-end px-4 py-2 font-semibold">Sales (SAR)</th>
                <th className="text-end px-4 py-2 font-semibold">Share</th>
                <th className="text-end px-4 py-2 font-semibold">Qty</th>
                <th className="text-end px-4 py-2 font-semibold">Customers</th>
                <th className="text-end px-4 py-2 font-semibold">Salesmen</th>
              </tr>
            </thead>
            <tbody>
              {regionSales.map((r) => (
                <tr key={r.region} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{r.region}</td>
                  <td className="px-4 py-2 text-end font-mono text-emerald-600">{formatSAR(r.sales)}</td>
                  <td className="px-4 py-2 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${(r.sales / totalSales) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {((r.sales / totalSales) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-end font-mono">{formatNumber(r.qty)}</td>
                  <td className="px-4 py-2 text-end">{r.customers}</td>
                  <td className="px-4 py-2 text-end">{r.salesmen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
