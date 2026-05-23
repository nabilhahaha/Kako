import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend, Area, AreaChart,
} from 'recharts';
import type { MonthlySales, RegionSales } from '@/lib/salesTypes';
import { CHART_COLORS, tooltipStyle, sarFormatter, axisProps } from '@/lib/dashboardTheme';

interface Props {
  monthlySales: MonthlySales[];
  regionSales: RegionSales[];
  channelSales: { channel: string; sales: number; qty: number; customers: number }[];
}

export function OverviewTab({ monthlySales, regionSales, channelSales }: Props) {
  const data = monthlySales.map(m => {
    const [y, mo] = m.month.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return { ...m, label: `${names[parseInt(mo)-1]} '${y.slice(2)}` };
  });

  return (
    <div className="space-y-3">
      {/* Full-width area chart */}
      <div className="chart-card">
        <h3>Monthly Sales Trend</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} {...axisProps} />
              <Tooltip formatter={sarFormatter} contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2.5} fill="url(#salesGrad)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#3b82f6' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Region pie */}
        <div className="chart-card">
          <h3>Revenue by Region</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={regionSales.slice(0,8)} dataKey="sales" nameKey="region"
                  cx="50%" cy="45%" outerRadius={95} innerRadius={50} paddingAngle={2}
                  label={({ percent, ...r }) => `${(r as Record<string,unknown>).region} ${((percent??0)*100).toFixed(0)}%`}
                  labelLine={{ strokeWidth: 0.5, stroke: '#94a3b8' }}>
                  {regionSales.slice(0,8).map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={sarFormatter} contentStyle={tooltipStyle} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={7}
                  formatter={(v: string) => <span style={{ fontSize: 11, color: '#64748b' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Channel horizontal bars */}
        <div className="chart-card">
          <h3>Sales by Channel</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelSales} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} {...axisProps} />
                <YAxis type="category" dataKey="channel" {...axisProps} width={90} />
                <Tooltip formatter={sarFormatter} contentStyle={tooltipStyle} />
                <Bar dataKey="sales" radius={[0,4,4,0]}>
                  {channelSales.map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Sales vs Returns stacked */}
      <div className="chart-card">
        <h3>Sales vs Returns (Monthly)</h3>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} {...axisProps} />
              <Tooltip formatter={sarFormatter} contentStyle={tooltipStyle} />
              <Legend verticalAlign="top" height={28} iconType="circle" iconSize={7}
                formatter={(v: string) => <span style={{ fontSize: 11, color: '#64748b' }}>{v}</span>} />
              <Bar name="Sales" dataKey="sales" fill="#3b82f6" radius={[3,3,0,0]} />
              <Bar name="Returns" dataKey="returns" fill="#ef4444" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
