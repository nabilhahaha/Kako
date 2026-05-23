import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import type { MonthlySales, RegionSales } from '@/lib/salesTypes';
import { formatSAR } from '@/lib/salesDataUtils';

const sarFormatter = (value: unknown) => [formatSAR(Number(value)), 'Sales'];
const returnFormatter = (value: unknown) => [formatSAR(Number(value)), 'Returns'];

const COLORS = ['#DC2626', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

interface Props {
  monthlySales: MonthlySales[];
  regionSales: RegionSales[];
  channelSales: { channel: string; sales: number; qty: number; customers: number }[];
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

export function OverviewTab({ monthlySales, regionSales, channelSales }: Props) {
  const monthLabels = monthlySales.map((m) => {
    const [y, mo] = m.month.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { ...m, label: `${names[parseInt(mo) - 1]} ${y.slice(2)}` };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="📈 Monthly Sales Trend">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthLabels}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={sarFormatter}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="sales" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="🌍 Sales by Region">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={regionSales.slice(0, 8)}
                dataKey="sales"
                nameKey="region"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ percent, ...rest }) =>
                  `${(rest as Record<string, unknown>).region} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={{ strokeWidth: 1 }}
              >
                {regionSales.slice(0, 8).map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={sarFormatter} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="📊 Monthly Returns">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthLabels}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={returnFormatter}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="returns" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="🏪 Sales by Channel">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channelSales} layout="vertical">
              <XAxis
                type="number"
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
              />
              <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} width={100} />
              <Tooltip
                formatter={sarFormatter}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                {channelSales.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
