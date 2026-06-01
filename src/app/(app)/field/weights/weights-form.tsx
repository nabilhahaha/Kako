'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { saveScoreWeights, type WeightRow } from './weights-actions';

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
const STATES = ['required', 'optional', 'disabled'] as const;
const COMPONENT_KEY: Record<string, string> = {
  coverage: 'field.dashboard.coveragePct', compliance: 'field.dashboard.compliancePct',
  merchandising: 'field.score.merch', oos: 'field.score.oos', survey: 'field.score.survey', opportunity: 'field.score.opportunities',
};

/** FE-5c — per-component weight + state editor. Overall = Σ(score×weight) ÷
 *  Σ(participating weights); state governs missing data (see stateHelp). */
export function WeightsForm({ initialRows, custom }: { initialRows: WeightRow[]; custom: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<WeightRow[]>(initialRows);
  const [pending, startTransition] = useTransition();

  // total of only the participating components (disabled excluded), for the share hint
  const activeTotal = useMemo(() => rows.filter((r) => r.state !== 'disabled').reduce((s, r) => s + (Number(r.weight) || 0), 0), [rows]);

  function update(component: string, patch: Partial<WeightRow>) {
    setRows((rs) => rs.map((r) => (r.component === component ? { ...r, ...patch } : r)));
  }
  function onSave() {
    startTransition(async () => {
      const res = await saveScoreWeights(rows.map((r) => ({ ...r, weight: Math.max(0, Number(r.weight) || 0) })));
      if (!res.ok) { toast.error(res.error ?? t('field.weights.saveFailed')); return; }
      toast.success(t('field.weights.saved'));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {!custom && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{t('field.weights.usingDefaults')}</p>}
        <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-3 px-1 text-[11px] font-medium text-muted-foreground sm:grid">
          <span>{t('field.weights.component')}</span><span className="w-20 text-center">{t('field.weights.weight')}</span>
          <span className="w-28 text-center">{t('field.weights.state')}</span><span className="w-12 text-end">%</span>
        </div>
        {rows.map((r) => {
          const share = r.state !== 'disabled' && activeTotal > 0 ? Math.round((100 * (Number(r.weight) || 0)) / activeTotal) : null;
          return (
            <div key={r.component} className="grid grid-cols-2 items-center gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
              <span className="text-sm font-medium">{t(COMPONENT_KEY[r.component] ?? r.component)}</span>
              <Input type="number" min={0} step={1} inputMode="numeric" value={r.weight}
                onChange={(e) => update(r.component, { weight: e.target.value === '' ? 0 : Number(e.target.value) })}
                className="h-9 w-20" disabled={r.state === 'disabled'} />
              <select className={`${selectCls} w-28`} value={r.state} onChange={(e) => update(r.component, { state: e.target.value as WeightRow['state'] })}>
                {STATES.map((s) => <option key={s} value={s}>{t(`field.weights.states.${s}`)}</option>)}
              </select>
              <span className="w-12 text-end text-xs tabular-nums text-muted-foreground">{share != null ? `${share}%` : '—'}</span>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">{t('field.weights.stateHelp')}</p>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <Badge variant="secondary">{t('field.weights.total')}: {activeTotal}</Badge>
          <Button onClick={onSave} disabled={pending}>
            {pending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('field.weights.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
