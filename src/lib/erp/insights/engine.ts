/**
 * VANTORA Insights — deterministic intelligence engine (NO external AI).
 *
 * Pure functions that turn already-authorized numeric series into bilingual,
 * explainable insights: KPI change explanations, customer-decline detection,
 * coverage drop, anomaly/exception detection, run-rate forecasting, and
 * opportunity signals. This is the "why is this happening / what next" layer —
 * deterministic, testable, no data writes, no model. The server action supplies
 * the RLS-scoped numbers.
 */

export type Locale = 'en' | 'ar';
export type InsightKind = 'sales' | 'coverage' | 'customer' | 'forecast' | 'opportunity' | 'exception' | 'kpi';
export type InsightSeverity = 'positive' | 'info' | 'warning' | 'danger';

export interface Insight {
  code: string;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  detail?: string;
}

const T = (en: string, ar: string, l: Locale) => (l === 'ar' ? ar : en);
const pct = (current: number, previous: number): number => (previous ? Math.round(((current - previous) / Math.abs(previous)) * 100) : current > 0 ? 100 : 0);

// ── Trend classification ──────────────────────────────────────────────────────

export interface Trend {
  dir: 'up' | 'down' | 'flat';
  changePct: number;
}

/** Compare the latest value against the average of the prior values. */
export function classifyTrend(values: readonly number[]): Trend {
  if (values.length < 2) return { dir: 'flat', changePct: 0 };
  const latest = values[values.length - 1];
  const prior = values.slice(0, -1);
  const avgPrior = prior.reduce((n, v) => n + v, 0) / prior.length;
  const changePct = pct(latest, avgPrior);
  const dir = changePct >= 8 ? 'up' : changePct <= -8 ? 'down' : 'flat';
  return { dir, changePct };
}

// ── KPI change explanation (Executive / Sales intelligence) ──────────────────

export function kpiDeltaInsight(label: string, current: number, previous: number, locale: Locale = 'en'): Insight {
  const d = pct(current, previous);
  const sev: InsightSeverity = d > 0 ? 'positive' : d < -15 ? 'danger' : d < 0 ? 'warning' : 'info';
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '■';
  const title = T(
    `${label} ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'} ${arrow} ${Math.abs(d)}% vs last period`,
    `${label} ${d > 0 ? 'ارتفع' : d < 0 ? 'انخفض' : 'ثابت'} ${arrow} ${Math.abs(d)}% مقارنة بالفترة السابقة`,
    locale,
  );
  return { code: 'kpi_delta', kind: 'kpi', severity: sev, title };
}

// ── Lost-customer / customer-decline intelligence ────────────────────────────

/** Detect a declining customer from their monthly totals (oldest→newest). */
export function customerDeclineInsight(monthly: readonly number[], name: string, locale: Locale = 'en'): Insight | null {
  if (monthly.length < 2) return null;
  const t = classifyTrend(monthly);
  const last = monthly[monthly.length - 1];
  if (last === 0 && monthly.some((v) => v > 0)) {
    return {
      code: 'customer_stopped',
      kind: 'customer',
      severity: 'danger',
      title: T(`${name} placed no orders this period`, `${name} لم يطلب في هذه الفترة`, locale),
      detail: T('Was active previously — likely at risk. Schedule a visit.', 'كان نشطاً سابقاً — على الأرجح معرّض للفقد. حدّد زيارة.', locale),
    };
  }
  if (t.dir === 'down') {
    return {
      code: 'customer_declining',
      kind: 'customer',
      severity: 'warning',
      title: T(`${name} orders down ${Math.abs(t.changePct)}%`, `${name} طلباته منخفضة ${Math.abs(t.changePct)}%`, locale),
      detail: T('Declining trend — worth a check-in.', 'اتجاه هابط — يستحق المتابعة.', locale),
    };
  }
  return null;
}

// ── Coverage intelligence ────────────────────────────────────────────────────

export function coverageDropInsight(current: number | null, previous: number | null, locale: Locale = 'en'): Insight | null {
  if (current == null || previous == null) return null;
  const d = pct(current, previous);
  if (d >= -8) return null;
  return {
    code: 'coverage_drop',
    kind: 'coverage',
    severity: d < -25 ? 'danger' : 'warning',
    title: T(`Coverage dropped ${Math.abs(d)}% to ${Math.round(current)}%`, `انخفضت التغطية ${Math.abs(d)}% إلى ${Math.round(current)}%`, locale),
    detail: T('Review routes with the most missed visits.', 'راجع خطوط السير الأكثر تخطّياً للزيارات.', locale),
  };
}

// ── Exception / anomaly detection ────────────────────────────────────────────

/** Flag points more than `k` std-devs from the mean of the series. */
export function anomalyInsights(label: string, series: readonly number[], locale: Locale = 'en', k = 2): Insight[] {
  if (series.length < 4) return [];
  const mean = series.reduce((n, v) => n + v, 0) / series.length;
  const variance = series.reduce((n, v) => n + (v - mean) ** 2, 0) / series.length;
  const std = Math.sqrt(variance);
  if (std === 0) return [];
  const latest = series[series.length - 1];
  const z = (latest - mean) / std;
  if (z >= k) {
    return [{ code: 'anomaly_spike', kind: 'exception', severity: 'info', title: T(`${label}: unusual spike (latest well above normal)`, `${label}: ارتفاع غير معتاد (الأحدث أعلى بكثير من الطبيعي)`, locale) }];
  }
  if (z <= -k) {
    return [{ code: 'anomaly_drop', kind: 'exception', severity: 'warning', title: T(`${label}: unusual drop (latest well below normal)`, `${label}: انخفاض غير معتاد (الأحدث أقل بكثير من الطبيعي)`, locale) }];
  }
  return [];
}

// ── Forecasting intelligence (run-rate) ──────────────────────────────────────

/** Project a period-end total from actual-to-date and elapsed days. */
export function runRateForecast(actualToDate: number, daysElapsed: number, daysInPeriod: number): number {
  if (daysElapsed <= 0) return 0;
  return Math.round((actualToDate / daysElapsed) * daysInPeriod);
}

export function forecastInsight(actualToDate: number, target: number, daysElapsed: number, daysInPeriod: number, locale: Locale = 'en'): Insight {
  const projected = runRateForecast(actualToDate, daysElapsed, daysInPeriod);
  if (target <= 0) {
    return { code: 'forecast', kind: 'forecast', severity: 'info', title: T(`Projected period total ≈ ${projected}`, `الإجمالي المتوقّع للفترة ≈ ${projected}`, locale) };
  }
  const onTrack = projected >= target;
  return {
    code: 'forecast_vs_target',
    kind: 'forecast',
    severity: onTrack ? 'positive' : projected < target * 0.7 ? 'danger' : 'warning',
    title: T(
      `Projected ${projected} vs target ${target} — ${onTrack ? 'on track' : 'below target'}`,
      `المتوقّع ${projected} مقابل الهدف ${target} — ${onTrack ? 'على المسار' : 'دون الهدف'}`,
      locale,
    ),
  };
}

// ── Opportunity detection ────────────────────────────────────────────────────

/** A growing customer is an upsell opportunity. */
export function opportunityInsight(monthly: readonly number[], name: string, locale: Locale = 'en'): Insight | null {
  const t = classifyTrend(monthly);
  if (t.dir !== 'up') return null;
  return {
    code: 'opportunity_growth',
    kind: 'opportunity',
    severity: 'positive',
    title: T(`${name} orders up ${t.changePct}% — upsell opportunity`, `${name} طلباته مرتفعة ${t.changePct}% — فرصة بيع إضافي`, locale),
  };
}

/** Order insights most-actionable first (danger → warning → info → positive). */
export function rankInsights(insights: readonly Insight[]): Insight[] {
  const rank: Record<InsightSeverity, number> = { danger: 0, warning: 1, info: 2, positive: 3 };
  return [...insights].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
