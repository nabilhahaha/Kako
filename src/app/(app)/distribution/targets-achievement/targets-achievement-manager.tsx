'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { formatNumber } from '@/lib/utils';
import {
  upsertTarget,
  deleteTarget,
  targetAchievement,
  type TargetAchievement,
} from '@/app/(app)/fmcg/actions';

export interface TargetRow {
  id: string;
  level: string;
  scope_id: string | null;
  period: string;
  period_start: string;
  period_end: string;
  metric: string;
  target_value: number;
}

const LEVELS = ['company', 'region', 'branch', 'manager', 'supervisor', 'salesman', 'customer', 'product', 'category'];
const PERIODS = ['daily', 'weekly', 'monthly', 'quarterly'];
const METRICS = ['sales_value', 'quantity', 'visits', 'coverage', 'strike_rate', 'new_customers', 'collections'];

const TODAY = new Date().toISOString().slice(0, 10);

export function TargetsAchievementManager({ rows, canManage }: { rows: TargetRow[]; canManage: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [level, setLevel] = useState('company');
  const [period, setPeriod] = useState('monthly');
  const [metric, setMetric] = useState('sales_value');
  const [start, setStart] = useState(TODAY);
  const [end, setEnd] = useState(TODAY);
  const [value, setValue] = useState('');

  const [achievements, setAchievements] = useState<Record<string, TargetAchievement>>({});

  const levelLabel = (v: string) => t(`fmcgw1.level${v.charAt(0).toUpperCase()}${v.slice(1)}`);
  const periodLabel = (v: string) => t(`fmcgw1.period${v.charAt(0).toUpperCase()}${v.slice(1)}`);
  const metricLabel = (v: string) => {
    const camel = v.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return t(`fmcgw1.metric${camel.charAt(0).toUpperCase()}${camel.slice(1)}`);
  };

  function add() {
    if (!value || !start || !end) {
      toast.error(t('fmcgw1.error'));
      return;
    }
    startTransition(async () => {
      const res = await upsertTarget({
        level,
        period,
        metric,
        period_start: start,
        period_end: end,
        target_value: Number(value),
      });
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.saved'));
      setValue('');
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteTarget(id);
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.deleted'));
      router.refresh();
    });
  }

  function showAchievement(id: string) {
    startTransition(async () => {
      const res = await targetAchievement(id);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      setAchievements((prev) => ({ ...prev, [id]: res.data! }));
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1">
                <Label>{t('fmcgw1.targetLevel')}</Label>
                <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                  {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.targetPeriod')}</Label>
                <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
                  {PERIODS.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.targetMetric')}</Label>
                <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
                  {METRICS.map((m) => <option key={m} value={m}>{metricLabel(m)}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.targetStart')}</Label>
                <Input type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.targetEnd')}</Label>
                <Input type="date" dir="ltr" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.targetValue')}</Label>
                <Input type="number" min={0} step="0.01" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
            </div>
            <div className="sticky bottom-2 flex justify-end">
              <Button onClick={add}>
                <Plus className="h-4 w-4" /> {t('fmcgw1.targetAdd')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<BarChart3 />} title={t('fmcgw1.targetEmpty')} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const a = achievements[r.id];
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{levelLabel(r.level)}</Badge>
                      <Badge variant="outline">{periodLabel(r.period)}</Badge>
                      <span className="font-medium">{metricLabel(r.metric)}</span>
                      <span className="text-sm text-muted-foreground" dir="ltr">
                        {r.period_start} → {r.period_end}
                      </span>
                      <span className="font-bold tabular-nums" dir="ltr">{formatNumber(r.target_value)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => showAchievement(r.id)}>
                        <BarChart3 className="h-4 w-4" /> {t('fmcgw1.targetShowAchievement')}
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label={t('fmcgw1.delete')}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {a && (
                    <div className="grid grid-cols-2 gap-3 rounded-md border bg-secondary/30 p-3 sm:grid-cols-3 lg:grid-cols-6">
                      <Metric label={t('fmcgw1.targetActual')} value={a.actual == null ? '—' : formatNumber(a.actual)} />
                      <Metric label={t('fmcgw1.targetPct')} value={a.achievement_pct == null ? '—' : `${a.achievement_pct}%`} />
                      <Metric label={t('fmcgw1.targetGap')} value={a.gap == null ? '—' : formatNumber(a.gap)} />
                      <Metric label={t('fmcgw1.targetRemainingDays')} value={String(a.remaining_days)} />
                      <Metric label={t('fmcgw1.targetRunRate')} value={a.required_daily_run_rate == null ? '—' : formatNumber(a.required_daily_run_rate)} />
                      <Metric label={t('fmcgw1.targetForecast')} value={a.forecast == null ? '—' : formatNumber(a.forecast)} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}
