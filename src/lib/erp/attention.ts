/**
 * Attention / route-health scoring (pure, deterministic, no I/O).
 *
 * The "exceptions-first" supervisor model: given the role-tailored attention
 * items the server already authorized (RLS-scoped, e.g. from `nextBestActions`),
 * rank them so the most urgent surface first, summarize them into a health
 * signal, and band coverage. Pure functions — fully unit-testable and reusable
 * by the dashboard, the Attention Center, and the Copilot "now" view.
 */

export type AttentionSeverity = 'info' | 'warning' | 'danger';

/** Structural shape of an attention item (matches the Copilot AttentionItem). */
export interface AttentionLike {
  title: string;
  count: number;
  href: string;
  severity: AttentionSeverity;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** Exceptions-first ordering: danger → warning → info, then larger counts first. */
export function rankAttention<T extends AttentionLike>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count,
  );
}

export interface AttentionSummary {
  /** Number of distinct attention items. */
  itemCount: number;
  /** Sum of counts across all items. */
  total: number;
  danger: number;
  warning: number;
  info: number;
  topSeverity: AttentionSeverity | 'none';
  /** 0–100; 100 = nothing needs attention. */
  healthScore: number;
  healthBand: 'good' | 'attention' | 'critical';
}

/** Summarize attention items into counts + a single health signal. */
export function summarizeAttention(items: readonly AttentionLike[]): AttentionSummary {
  const sumOf = (s: AttentionSeverity) =>
    items.filter((i) => i.severity === s).reduce((n, i) => n + Math.max(0, i.count), 0);
  const danger = sumOf('danger');
  const warning = sumOf('warning');
  const info = sumOf('info');
  const total = danger + warning + info;

  const topSeverity: AttentionSummary['topSeverity'] =
    danger > 0 ? 'danger' : warning > 0 ? 'warning' : info > 0 ? 'info' : 'none';

  // Weighted penalty (danger hurts most), capped so the score stays in [0,100].
  const penalty = Math.min(100, danger * 15 + warning * 5 + info * 1);
  const healthScore = Math.max(0, 100 - penalty);
  const healthBand = healthScore >= 80 ? 'good' : healthScore >= 50 ? 'attention' : 'critical';

  return { itemCount: items.length, total, danger, warning, info, topSeverity, healthScore, healthBand };
}

/** Coverage % → route-health band (used by coverage/route summaries). */
export function coverageBand(pct: number | null | undefined): 'good' | 'attention' | 'critical' | 'unknown' {
  if (pct == null || Number.isNaN(pct)) return 'unknown';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'attention';
  return 'critical';
}
