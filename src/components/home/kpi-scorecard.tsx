import { Card, CardContent } from '@/components/ui/card';
import type { ScoreStatus } from '@/lib/erp/scorecard';

/** KPI scorecard with a target/achievement progress bar (manager command center).
 *  Adapts the CRM/PM KPI-card pattern. Server-rendered, no client JS. */

const STATUS_BAR: Record<ScoreStatus, string> = {
  ahead: 'bg-success',
  onTrack: 'bg-primary',
  behind: 'bg-warning',
  critical: 'bg-destructive',
};
const STATUS_TEXT: Record<ScoreStatus, string> = {
  ahead: 'text-success',
  onTrack: 'text-primary',
  behind: 'text-warning',
  critical: 'text-destructive',
};

export function KpiScorecard({
  label,
  value,
  achievement,
  status,
  statusLabel,
}: {
  label: string;
  value: string;
  /** achievement % (0–N); drives the bar width (capped at 100 visually). */
  achievement?: number;
  status?: ScoreStatus;
  statusLabel?: string;
}) {
  const pct = achievement == null ? null : Math.max(0, Math.min(100, achievement));
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          {achievement != null && status && (
            <span className={`text-xs font-semibold ${STATUS_TEXT[status]}`} dir="ltr">
              {achievement}%{statusLabel ? ` · ${statusLabel}` : ''}
            </span>
          )}
        </div>
        <p className="truncate text-2xl font-bold tabular-nums" dir="ltr">{value}</p>
        {pct != null && status && (
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${STATUS_BAR[status]}`} style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
