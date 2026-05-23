import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from 'recharts';
import type { MonthlySales } from '@/lib/salesTypes';
import { formatSAR, formatNumber } from '@/lib/salesDataUtils';

const sarFormatter = (value: unknown) => [formatSAR(Number(value)), 'Sales'];
const qtyFormatter = (value: unknown) => [formatNumber(Number(value)), 'Qty'];

interface Props {
  monthlySales: MonthlySales[];
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`;
}

export function TrendTab({ monthlySales }: Props) {
  const data = monthlySales.map((m) => ({ ...m, label: monthLabel(m.month) }));

  const growthData = data.map((m, i) => {
    const prev = i > 0 ? data[i - 1].sales : m.sales;
    const growth = prev > 0 ? ((m.sales - prev) / prev) * 100 : 0;
    return { ...m, growth: Math.round(growth * 10) / 10 };
  });

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">📈 Sales Trend (Monthly)</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={sarFormatter}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Line
                type="monotone" dataKey="sales" stroke="#10B981"
                strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">📦 Quantity Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={qtyFormatter} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="qty" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-xl border p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">📊 Month-over-Month Growth %</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthData.slice(1)}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: unknown) => [`${Number(value)}%`, 'Growth']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="growth" radius={[4, 4, 0, 0]}>
                  {growthData.slice(1).map((d, i) => (
                    <rect key={i} fill={d.growth >= 0 ? '#10B981' : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-bold text-foreground">📋 Monthly Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-start px-4 py-2 font-semibold">Month</th>
                <th className="text-end px-4 py-2 font-semibold">Sales (SAR)</th>
                <th className="text-end px-4 py-2 font-semibold">Returns</th>
                <th className="text-end px-4 py-2 font-semibold">Net</th>
                <th className="text-end px-4 py-2 font-semibold">Qty</th>
                <th className="text-end px-4 py-2 font-semibold">Customers</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.month} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{m.label}</td>
                  <td className="px-4 py-2 text-end font-mono text-emerald-600">{formatSAR(m.sales)}</td>
                  <td className="px-4 py-2 text-end font-mono text-red-500">{formatSAR(m.returns)}</td>
                  <td className="px-4 py-2 text-end font-mono">{formatSAR(m.sales - m.returns)}</td>
                  <td className="px-4 py-2 text-end font-mono">{formatNumber(m.qty)}</td>
                  <td className="px-4 py-2 text-end">{m.customers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
