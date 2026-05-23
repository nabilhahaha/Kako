export const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#ec4899', '#f97316',
  '#84cc16', '#6366f1',
];

export const tooltipStyle: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid hsl(214 32% 91%)',
  boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
  fontSize: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
  padding: '8px 12px',
  background: 'white',
};

export const axisProps = {
  tick: { fontSize: 11, fill: '#94a3b8' },
  axisLine: false as const,
  tickLine: false as const,
};

export function sarFormatter(value: unknown) {
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) return [`${(n / 1_000_000).toFixed(2)}M SAR`, ''];
  if (Math.abs(n) >= 1_000) return [`${(n / 1_000).toFixed(1)}K SAR`, ''];
  return [`${n.toFixed(0)} SAR`, ''];
}

export function qtyFormatter(value: unknown) {
  return [Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 }), ''];
}

export function pctFormatter(value: unknown) {
  return [`${Number(value).toFixed(1)}%`, ''];
}
