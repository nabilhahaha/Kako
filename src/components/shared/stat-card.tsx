import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export type StatTone = 'primary' | 'success' | 'warning' | 'destructive' | 'info';

const TONE_CLS: Record<StatTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

/** Optional trend indicator: a short delta label + direction (up is good = green,
 *  down = red, flat = muted). Additive — existing call sites are unaffected. */
export interface StatTrend {
  label: string; // e.g. "▲ 12%" content (text only; arrow added by direction)
  dir: 'up' | 'down' | 'flat';
}

const TREND_CLS: Record<StatTrend['dir'], string> = {
  up: 'text-success',
  down: 'text-destructive',
  flat: 'text-muted-foreground',
};
const TREND_ICON: Record<StatTrend['dir'], LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

/** Shared dashboard metric card used by every vertical's لوحة (overview).
 *  When `href` is set the whole card becomes a link with a hover affordance.
 *  `trend` and `hint` are optional, backward-compatible enrichments for the
 *  role homes (achievement %, deltas, health signals). */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  href,
  trend,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: StatTone;
  href?: string;
  trend?: StatTrend;
  hint?: string;
}) {
  const TrendIcon = trend ? TREND_ICON[trend.dir] : null;
  const body = (
    <Card className={href ? 'transition-colors hover:border-primary/40' : ''}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TONE_CLS[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="flex items-baseline gap-2">
            <p className="truncate text-xl font-bold tabular-nums" dir="ltr">{value}</p>
            {trend && TrendIcon && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${TREND_CLS[trend.dir]}`} dir="ltr">
                <TrendIcon className="h-3.5 w-3.5" />
                {trend.label}
              </span>
            )}
          </div>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
