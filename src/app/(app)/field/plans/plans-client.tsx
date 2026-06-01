'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Wand2, Send, ChevronUp, ChevronDown, Ban, RotateCcw, Plus, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { generatePlan, publishPlan, reorderStops, setStopSkipped, setStopPriority, addStop } from '../plan-actions';

export interface PlanRoute { id: string; name: string; repName: string | null }
export interface PlanInfo { id: string; status: string }
export interface PlanStop { id: string; seq: number; status: 'planned' | 'visited' | 'missed' | 'skipped'; priority: string; due: boolean; customerId: string; customerName: string; code: string | null }
export interface AddCustomer { id: string; name: string; code: string | null }

const selectCls = 'h-10 rounded-md border border-input bg-background px-3 text-sm';

export function PlansClient({ routes, selectedRoute, date, plan, stops, customers }: {
  routes: PlanRoute[]; selectedRoute: string | null; date: string; plan: PlanInfo | null; stops: PlanStop[]; customers: AddCustomer[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [addPick, setAddPick] = useState('');

  function navigate(route: string | null, d: string) {
    const params = new URLSearchParams();
    if (route) params.set('route', route);
    params.set('date', d);
    router.push(`/field/plans?${params.toString()}`);
  }
  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) { toast.error(r.error ?? 'error'); return; }
      if (ok) toast.success(ok);
      router.refresh();
    });
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...stops];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    run(() => reorderStops(next.map((s) => s.id)));
  }

  const addable = customers.filter((c) => !stops.some((s) => s.customerId === c.id));

  return (
    <div className="space-y-4">
      {/* route + date pickers */}
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1"><Label>{t('field.plans.route')}</Label>
          <select className={selectCls} value={selectedRoute ?? ''} onChange={(e) => navigate(e.target.value || null, date)}>
            <option value="">{t('field.plans.pickRoute')}</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.repName ? ` · ${r.repName}` : ''}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label>{t('field.plans.date')}</Label>
          <Input type="date" dir="ltr" className="h-10" value={date} onChange={(e) => navigate(selectedRoute, e.target.value)} />
        </div>
        {selectedRoute && (
          <Button disabled={pending} onClick={() => run(async () => { const r = await generatePlan(selectedRoute, date); return r; }, t('field.plans.generated'))}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {t('field.plans.generate')}
          </Button>
        )}
      </CardContent></Card>

      {selectedRoute && plan && (
        <Card><CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <Badge variant={plan.status === 'published' ? 'success' : 'secondary'}>{plan.status === 'published' ? t('field.plans.published') : t('field.plans.draft')} · {stops.filter((s) => s.due).length} {t('field.plans.stops')}</Badge>
            <Button size="sm" disabled={pending} onClick={() => run(() => publishPlan(plan.id), t('field.plans.publishedOk'))}>
              <Send className="h-4 w-4" /> {t('field.plans.publish')}
            </Button>
          </div>

          {stops.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{t('field.plans.noStops')}</p>}

          <div className="divide-y rounded-md border">
            {stops.map((s, i) => (
              <div key={s.id} className={`flex items-center justify-between gap-2 p-3 text-sm ${s.status === 'skipped' ? 'opacity-50' : ''}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                  <select className="h-8 rounded border border-input bg-background px-1 text-xs" value={s.priority} disabled={pending} onChange={(e) => run(() => setStopPriority(s.id, e.target.value as 'A' | 'B' | 'C'))}>
                    {['A', 'B', 'C'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span className="min-w-0 truncate font-medium">{s.customerName}</span>
                  {s.status === 'visited' && <Badge variant="secondary">{t('field.route.visited')}</Badge>}
                  {s.status === 'skipped' && <Badge variant="outline">{t('field.route.skipped')}</Badge>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={pending} onClick={() => move(i, -1)}><ChevronUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={pending} onClick={() => move(i, 1)}><ChevronDown className="h-4 w-4" /></Button>
                  {s.status === 'skipped'
                    ? <Button size="icon" variant="ghost" className="h-8 w-8" disabled={pending} onClick={() => run(() => setStopSkipped(s.id, false))}><RotateCcw className="h-4 w-4" /></Button>
                    : <Button size="icon" variant="ghost" className="h-8 w-8" disabled={pending} onClick={() => run(() => setStopSkipped(s.id, true))}><Ban className="h-4 w-4 text-destructive" /></Button>}
                </div>
              </div>
            ))}
          </div>

          {/* add customer */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1"><Label>{t('field.plans.addCustomer')}</Label>
              <select className={`${selectCls} w-full`} value={addPick} onChange={(e) => setAddPick(e.target.value)}>
                <option value="">—</option>
                {addable.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
              </select>
            </div>
            <Button variant="outline" disabled={pending || !addPick} onClick={() => run(async () => { const r = await addStop(plan.id, addPick); setAddPick(''); return r; })}>
              <Plus className="h-4 w-4" /> {t('field.plans.addCustomer')}
            </Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
