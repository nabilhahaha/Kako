import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { getT } from '@/lib/i18n/server';

export interface BreakdownRow {
  component: string;
  score: number | null;
  weight: number;
  state: 'required' | 'optional' | 'disabled';
  contribution: number | null;
}

type T = Awaited<ReturnType<typeof getT>>['t'];

/** Component label → reuse existing dashboard/score keys (no new strings needed). */
const COMPONENT_KEY: Record<string, string> = {
  coverage: 'field.dashboard.coveragePct',
  compliance: 'field.dashboard.compliancePct',
  merchandising: 'field.score.merch',
  oos: 'field.score.oos',
  survey: 'field.score.survey',
  opportunity: 'field.score.opportunities',
};

/** FE-5c: configurable weighted score breakdown — Component Score × Weight =
 *  Contribution, with the component state (required / optional / disabled). */
export function ScoreBreakdown({ rows, overall, t }: { rows: BreakdownRow[]; overall: number | null; t: T }) {
  if (!rows?.length) return null;
  const stateVariant = (s: BreakdownRow['state']) => (s === 'required' ? 'default' : s === 'disabled' ? 'outline' : 'secondary');
  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{t('field.perf.scoreBreakdown')}</p>
          <Badge variant="secondary" className="text-sm">{overall ?? '—'}</Badge>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">{t('field.perf.formula')}</p>
        <div className="space-y-1">
          {rows.map((r) => {
            const excluded = r.state === 'disabled' || (r.score === null);
            return (
              <div key={r.component} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${excluded ? 'opacity-60' : ''}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{t(COMPONENT_KEY[r.component] ?? r.component)}</span>
                  <Badge variant={stateVariant(r.state)} className="shrink-0 text-[10px]">{t(`field.weights.states.${r.state}`)}</Badge>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {r.score ?? t('field.perf.noScore')} × {r.weight} = <span className="font-semibold text-foreground">{r.contribution ?? '—'}</span>
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
