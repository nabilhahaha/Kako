export const CHART_COLORS = [
  '#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#f97316',
  '#84cc16', '#6366f1',
];

export const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid hsl(var(--border))',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  fontSize: 12,
  padding: '8px 12px',
};

export const statusColors = {
  critical: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', text: 'text-red-600', icon: '🔴' },
  high: { bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-600', icon: '🟠' },
  warning: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', border: 'border-yellow-200 dark:border-yellow-800', text: 'text-yellow-600', icon: '🟡' },
  ok: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-600', icon: '🟢' },
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
