'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export interface TrendSeries { key: string; label: string; color: string }

/** Mobile-friendly line trend chart (recharts). `data` is an array of buckets
 *  with `bucket` (date) + numeric series keys. */
export function TrendChart({ data, series, height = 170, legend = true }: {
  data: Record<string, unknown>[]; series: TrendSeries[]; height?: number; legend?: boolean;
}) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} width={30} />
        <Tooltip contentStyle={{ fontSize: 12 }} labelStyle={{ fontSize: 11 }} />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Shared series colors for field trends. */
export const TREND_COLORS = {
  coverage: '#2563eb', compliance: '#16a34a', overall: '#7c3aed',
  merch: '#0891b2', survey: '#ca8a04', oos: '#dc2626', opportunity: '#059669',
  competitor: '#db2777',
} as const;
