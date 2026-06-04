import { TrendingUp, AlertTriangle, AlertCircle, Info, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { Lightbulb } from 'lucide-react';
import type { Insight, InsightSeverity } from '@/lib/erp/insights/engine';

/** Deterministic insights list (server-rendered). Severity-colored, most
 *  actionable first. Reuses Card/EmptyState. */

const SEV: Record<InsightSeverity, { icon: LucideIcon; cls: string }> = {
  positive: { icon: TrendingUp, cls: 'text-success' },
  info: { icon: Info, cls: 'text-muted-foreground' },
  warning: { icon: AlertTriangle, cls: 'text-warning' },
  danger: { icon: AlertCircle, cls: 'text-destructive' },
};

export function InsightsPanel({ insights, emptyTitle }: { insights: Insight[]; emptyTitle: string }) {
  if (insights.length === 0) return <EmptyState icon={<Lightbulb />} title={emptyTitle} />;
  return (
    <ul className="space-y-2">
      {insights.map((it, i) => {
        const Icon = SEV[it.severity].icon;
        return (
          <li key={i}>
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${SEV[it.severity].cls}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{it.title}</p>
                  {it.detail && <p className="mt-0.5 text-xs text-muted-foreground">{it.detail}</p>}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
