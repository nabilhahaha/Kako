'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Lock } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { runCommission, approveCommission, runIncentive, approveIncentive } from '../actions';

export interface Combined { rep_id: string; name: string | null; commission: number; incentive: number; total: number }
export interface Payout { id: string; label: string | null; payout: number; status: string; frozen: boolean; achievement_pct?: number | null; conditions_met?: boolean; qualified?: boolean }
export interface NamedRow { id: string; name: string; status: string }
const n2 = (n: number) => Number(n).toLocaleString();
const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export function StatementsClient({ month, isAdmin, combined, commission, incentive, plans, programs }:
  { month: string; isAdmin: boolean; combined: Combined[]; commission: Payout[]; incentive: Payout[]; plans: NamedRow[]; programs: NamedRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [plan, setPlan] = useState(plans[0]?.id ?? '');
  const [program, setProgram] = useState(programs[0]?.id ?? '');

  const act = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okMsg?: (d: unknown) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { toast.error(r.error ?? t('commercial.runFailed')); return; }
      toast.success(okMsg ? okMsg(r.data) : t('commercial.saved')); router.refresh();
    });
  const qualified = (d: unknown) => t('commercial.ran').replace('{n}', String((d as { qualified?: number } | undefined)?.qualified ?? 0));

  return (
    <div className="space-y-3">
      {/* combined total */}
      <Card><CardContent className="p-0">
        <div className="border-b p-2.5 text-xs font-medium text-muted-foreground">{t('commercial.combined')}</div>
        {combined.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">—</div> : combined.map((r) => (
          <div key={r.rep_id} className="flex items-center gap-2 border-b p-2.5 text-sm last:border-0">
            <span className="min-w-0 flex-1 truncate font-medium">{r.name ?? '—'}</span>
            <span className="w-20 text-end text-xs text-muted-foreground">{t('commercial.commission')}: {n2(r.commission)}</span>
            <span className="w-20 text-end text-xs text-muted-foreground">{t('commercial.incentive')}: {n2(r.incentive)}</span>
            <span className="w-20 text-end font-semibold tabular-nums">{n2(r.total)}</span>
          </div>
        ))}
      </CardContent></Card>

      {/* commission */}
      <Ledger title={t('commercial.commission')} rows={commission} t={t}
        control={isAdmin && plans.length > 0 && (
          <RunControls value={plan} onChange={setPlan} options={plans} pending={pending}
            onRun={() => act(() => runCommission(plan, month), qualified)}
            onApprove={() => act(() => approveCommission(plan, month))} t={t} />
        )} />

      {/* incentive */}
      <Ledger title={t('commercial.incentive')} rows={incentive} t={t}
        control={isAdmin && programs.length > 0 && (
          <RunControls value={program} onChange={setProgram} options={programs} pending={pending}
            onRun={() => act(() => runIncentive(program, month), qualified)}
            onApprove={() => act(() => approveIncentive(program, month))} t={t} />
        )} />
    </div>
  );
}

function RunControls({ value, onChange, options, pending, onRun, onApprove, t }:
  { value: string; onChange: (v: string) => void; options: NamedRow[]; pending: boolean; onRun: () => void; onApprove: () => void; t: (k: string) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-2.5">
      <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={pending} onClick={onRun}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="me-1 h-3.5 w-3.5" />}{t('commercial.run')}</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={onApprove}><Lock className="me-1 h-3.5 w-3.5" />{t('commercial.approveFreeze')}</Button>
    </div>
  );
}
function Ledger({ title, rows, control, t }: { title: string; rows: Payout[]; control: React.ReactNode; t: (k: string) => string }) {
  return <Card><CardContent className="p-0">
    <div className="border-b p-2.5 text-xs font-medium text-muted-foreground">{title}</div>
    {control}
    {rows.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">—</div> : rows.map((r) => (
      <div key={r.id} className="flex items-center gap-2 border-b p-2.5 text-sm last:border-0">
        <span className="min-w-0 flex-1 truncate">{r.label ?? '—'}</span>
        {r.achievement_pct != null && <span className="text-xs text-muted-foreground">{r.achievement_pct}%</span>}
        <span className="w-20 text-end font-semibold tabular-nums">{n2(r.payout)}</span>
        {r.frozen ? <Badge variant="outline"><Lock className="me-1 h-3 w-3" />{t('commercial.frozen')}</Badge> : <Badge variant="secondary">{r.status}</Badge>}
      </div>
    ))}
  </CardContent></Card>;
}
