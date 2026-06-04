'use server';

/** ── VANTORA Insights — server action (flag-gated, deterministic, read-only) ──
 *
 *  Gathers the caller's RLS-scoped numbers (sales history, per-customer order
 *  trends) and runs the deterministic insight engine. NO LLM, NO data writes.
 *  Returns nothing unless `VANTORA_INSIGHTS_ENABLED` is on (OFF by default).
 *  Every read is defensive (degrades gracefully on the residual DB drift).
 */

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import type { ActionResult } from '@/lib/erp/guards';
import { today } from '@/lib/erp/work-session';
import { isInsightsEnabled } from '@/lib/erp/insights/flags';
import {
  kpiDeltaInsight, anomalyInsights, forecastInsight, customerDeclineInsight, opportunityInsight, rankInsights,
  type Insight, type Locale,
} from '@/lib/erp/insights/engine';

export interface InsightsResult {
  enabled: boolean;
  insights: Insight[];
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Last `n` month keys, oldest → newest, ending with the current month. */
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export async function companyInsights(locale: Locale = 'en'): Promise<ActionResult<InsightsResult>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!isInsightsEnabled()) return { ok: true, data: { enabled: false, insights: [] } };

  const supabase = await createClient();
  const date = today();
  const months = lastMonths(4);
  const since = `${months[0]}-01T00:00:00`;

  // Company sales history (RLS-scoped), grouped by month.
  const invoices = await safe(async () => {
    const { data } = await supabase
      .from('erp_invoices')
      .select('customer_id, net_amount, created_at, status')
      .gte('created_at', since)
      .in('status', ['issued', 'paid', 'partially_paid', 'overdue'])
      .limit(5000);
    return (data ?? []) as { customer_id: string; net_amount: number | null; created_at: string; status: string }[];
  }, []);

  const insights: Insight[] = [];

  // ── Sales / executive KPI + forecast + anomaly ──
  const byMonth = new Map<string, number>(months.map((m) => [m, 0]));
  for (const inv of invoices) {
    const k = monthKey(inv.created_at);
    if (byMonth.has(k)) byMonth.set(k, (byMonth.get(k) ?? 0) + Number(inv.net_amount ?? 0));
  }
  const series = months.map((m) => byMonth.get(m) ?? 0);
  const thisMonth = series[series.length - 1];
  const lastMonth = series[series.length - 2] ?? 0;
  if (invoices.length > 0) {
    insights.push(kpiDeltaInsight(locale === 'ar' ? 'المبيعات' : 'Sales', thisMonth, lastMonth, locale));
    insights.push(...anomalyInsights(locale === 'ar' ? 'المبيعات' : 'Sales', series, locale));
    const dayOfMonth = Number(date.slice(8, 10));
    const daysInMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
    insights.push(forecastInsight(thisMonth, 0, dayOfMonth, daysInMonth, locale));
  }

  // ── Customer decline / opportunity (per-customer monthly trend) ──
  const names = await safe(async () => {
    const { data } = await supabase.from('erp_customers').select('id, name').limit(2000);
    return new Map((data ?? []).map((c) => [(c as { id: string }).id, (c as { name: string }).name]));
  }, new Map<string, string>());

  const perCust = new Map<string, Map<string, number>>();
  for (const inv of invoices) {
    const k = monthKey(inv.created_at);
    if (!months.includes(k)) continue;
    const m = perCust.get(inv.customer_id) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + Number(inv.net_amount ?? 0));
    perCust.set(inv.customer_id, m);
  }
  for (const [custId, m] of perCust) {
    if (m.size < 2) continue;
    const custSeries = months.map((mo) => m.get(mo) ?? 0);
    const name = names.get(custId) ?? custId.slice(0, 8);
    const decline = customerDeclineInsight(custSeries, name, locale);
    if (decline) insights.push(decline);
    else {
      const opp = opportunityInsight(custSeries, name, locale);
      if (opp) insights.push(opp);
    }
  }

  return { ok: true, data: { enabled: true, insights: rankInsights(insights).slice(0, 12) } };
}
