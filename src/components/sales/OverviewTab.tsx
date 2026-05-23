import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend,
} from 'recharts';
import type { MonthlySales, RegionSales } from '@/lib/salesTypes';
import { formatSAR } from '@/lib/salesDataUtils';
import { CHART_COLORS, tooltipStyle, sarFormatter } from '@/lib/dashboardTheme';

interface Props {
  monthlySales: MonthlySales[];
  regionSales: RegionSales[];
  channelSales: { channel: string; sales: number; qty: number; customers: number }[];
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-xl border p-5 ${className}`}>
      <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">{title}</h3>
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
      <ChartCard title="📈 Monthly Sales Trend" className="lg:col-span-2">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthLabels} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
              />
              <Tooltip formatter={sarFormatter} contentStyle={tooltipStyle} />
              <Bar dataKey="sales" fill={CHART_COLORS[2]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="🌍 Revenue by Region">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={regionSales.slice(0, 8)}
                dataKey="sales"
                nameKey="region"
                cx="50%" cy="45%"
                outerRadius={100} innerRadius={45}
                paddingAngle={2}
                label={({ percent, ...rest }) =>
                  `${(rest as Record<string, unknown>).region} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={{ strokeWidth: 1 }}
              >
                {regionSales.slice(0, 8).map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: unknown) => [formatSAR(Number(v)), 'Sales']} contentStyle={tooltipStyle} />
              <Legend verticalAlign="bottom" height={30} iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="🏪 Sales by Channel">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channelSales} layout="vertical" barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
              />
              <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip formatter={sarFormatter} contentStyle={tooltipStyle} />
              <Bar dataKey="sales" radius={[0, 6, 6, 0]}>
                {channelSales.map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="📊 Monthly Returns vs Sales" className="lg:col-span-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthLabels} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={sarFormatter} contentStyle={tooltipStyle} />
              <Legend verticalAlign="top" height={30} iconType="circle" iconSize={8} />
              <Bar name="Sales" dataKey="sales" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
              <Bar name="Returns" dataKey="returns" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
