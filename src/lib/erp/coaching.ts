/**
 * Visit coaching — pure, deterministic (NO external AI). Maps a rep's
 * already-authorized field metrics to bilingual coaching tips. Adapts the
 * "next-action coaching" pattern (CRM activity nudges) using rules, not a model.
 */

export type Locale = 'en' | 'ar';

export interface VisitMetrics {
  coveragePct?: number | null;
  gpsViolations?: number;
  outOfRoute?: number;
  skipped?: number;
  minCoveragePct?: number | null;
}

export interface CoachingTip {
  code: string;
  severity: 'info' | 'warning' | 'danger';
  text: string;
}

const T = (en: string, ar: string, l: Locale) => (l === 'ar' ? ar : en);

/** Deterministic coaching tips, most-severe first. Empty input → an "all good"
 *  encouragement so the panel is never blank. */
export function coachingTips(m: VisitMetrics, locale: Locale = 'en'): CoachingTip[] {
  const tips: CoachingTip[] = [];
  const min = m.minCoveragePct ?? 80;

  if (m.coveragePct != null && m.coveragePct < min) {
    tips.push({
      code: 'low_coverage',
      severity: m.coveragePct < min / 2 ? 'danger' : 'warning',
      text: T(
        `Coverage is ${Math.round(m.coveragePct)}% — below the ${min}% target. Plan the remaining stops earlier in the day.`,
        `التغطية ${Math.round(m.coveragePct)}% — أقل من هدف ${min}%. رتّب باقي الزيارات في وقت أبكر من اليوم.`,
        locale,
      ),
    });
  }
  if ((m.gpsViolations ?? 0) > 0) {
    tips.push({
      code: 'gps',
      severity: 'warning',
      text: T(
        `${m.gpsViolations} GPS check-in issue(s). Check in within the customer's radius before recording the visit.`,
        `${m.gpsViolations} مخالفة GPS. سجّل الوصول ضمن نطاق العميل قبل تسجيل الزيارة.`,
        locale,
      ),
    });
  }
  if ((m.outOfRoute ?? 0) > 0) {
    tips.push({
      code: 'out_of_route',
      severity: 'info',
      text: T(
        `${m.outOfRoute} out-of-route visit(s). Keep to today's planned customers, or get supervisor approval.`,
        `${m.outOfRoute} زيارة خارج الخط. التزم بعملاء خطة اليوم أو احصل على موافقة المشرف.`,
        locale,
      ),
    });
  }
  if ((m.skipped ?? 0) > 0) {
    tips.push({
      code: 'skipped',
      severity: 'warning',
      text: T(
        `${m.skipped} customer(s) skipped today. Add a reason so the route plan can improve.`,
        `${m.skipped} عميل تم تخطّيه اليوم. أضِف سبباً لتحسين خطة خط السير.`,
        locale,
      ),
    });
  }

  if (tips.length === 0) {
    tips.push({
      code: 'all_good',
      severity: 'info',
      text: T('On track — coverage and compliance look good today. Keep it up!', 'أداء جيد — التغطية والالتزام ممتازان اليوم. واصل!', locale),
    });
  }

  const rank = { danger: 0, warning: 1, info: 2 };
  return tips.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
