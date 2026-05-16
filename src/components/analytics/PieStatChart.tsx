import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CHART_PALETTE } from './ChartCard';

interface PieStatChartProps {
  data: { name: string; value: number; color?: string }[];
  showLegend?: boolean;
}

export function PieStatChart({ data, showLegend = true }: PieStatChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={entry.color ?? CHART_PALETTE.series[i % CHART_PALETTE.series.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        {showLegend && (
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12 }}
            verticalAlign="bottom"
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}
