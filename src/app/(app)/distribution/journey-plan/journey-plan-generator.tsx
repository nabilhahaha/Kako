'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Wand2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { VISIT_DAYS } from '@/lib/erp/constants';
import type { Profile } from '@/lib/erp/types';
import { generateJourneyProposal, applyJourneyProposal, saveFrequencyRules, type JourneyProposal } from './actions';

type Rep = Pick<Profile, 'id' | 'full_name' | 'email'>;
type Route = { id: string; name: string; name_ar: string | null; rep_id: string | null };
type Rule = { classification: string; visitsPerWeek: number };

const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
const DEFAULT_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'];

export function JourneyPlanGenerator({
  routes, reps, initialRules,
}: {
  routes: Route[];
  reps: Rep[];
  initialRules: Rule[];
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const [pending, start] = useTransition();
  const [routeId, setRouteId] = useState('');
  const [salesmanId, setSalesmanId] = useState('');
  const [days, setDays] = useState<Set<string>>(new Set(DEFAULT_DAYS));
  const [proposal, setProposal] = useState<JourneyProposal | null>(null);
  const [rules, setRules] = useState<Rule[]>(initialRules);

  const dayLabel = (v: string) => VISIT_DAYS.find((d) => d.value === v)?.[locale] ?? v;
  const orderedIds = (dp: JourneyProposal['dayPlans'][number]) =>
    dp.route.order.length ? [...dp.route.order].sort((a, b) => a.order - b.order).map((o) => o.customerId) : dp.customerIds;

  function onRoute(id: string) {
    setRouteId(id);
    setProposal(null);
    const r = routes.find((x) => x.id === id);
    if (r?.rep_id) setSalesmanId(r.rep_id);
  }
  function toggleDay(v: string) {
    setDays((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  }

  function generate() {
    if (!routeId) { toast.error(t('journeyPlan.errPickRoute')); return; }
    if (days.size === 0) { toast.error(t('journeyPlan.errPickDays')); return; }
    start(async () => {
      const res = await generateJourneyProposal({ routeId, workingDays: [...days] });
      if (!res.ok) { toast.error(t(`journeyPlan.err_${res.error}`) || t('journeyPlan.errGeneric')); return; }
      setProposal(res.data);
    });
  }
  function apply() {
    if (!proposal) return;
    start(async () => {
      const res = await applyJourneyProposal({
        routeId, salesmanId: salesmanId || null,
        dayPlans: proposal.dayPlans.map((d) => ({ day: d.day, customerIds: orderedIds(d) })),
      });
      if (!res.ok) { toast.error(res.error ?? t('journeyPlan.errGeneric')); return; }
      toast.success(t('journeyPlan.applied'));
      setProposal(null);
      router.refresh();
    });
  }
  function saveRules() {
    start(async () => {
      const res = await saveFrequencyRules(rules);
      if (!res.ok) { toast.error(res.error ?? t('journeyPlan.errGeneric')); return; }
      toast.success(t('journeyPlan.rulesSaved'));
    });
  }

  return (
    <div className="space-y-4">
      {/* Frequency rules (company-configurable; no hardcoded values) */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <h3 className="text-sm font-semibold">{t('journeyPlan.rulesTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('journeyPlan.rulesHint')}</p>
          </div>
          <div className="space-y-2">
            {rules.map((r, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t('journeyPlan.classification')}</Label>
                  <Input className="w-28" value={r.classification} onChange={(e) => setRules((x) => x.map((y, j) => j === i ? { ...y, classification: e.target.value } : y))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('journeyPlan.visitsPerWeek')}</Label>
                  <Input className="w-28" type="number" step="0.5" min={0} dir="ltr" value={r.visitsPerWeek} onChange={(e) => setRules((x) => x.map((y, j) => j === i ? { ...y, visitsPerWeek: Number(e.target.value) } : y))} />
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setRules((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRules((x) => [...x, { classification: '', visitsPerWeek: 1 }])}><Plus className="h-4 w-4" /> {t('journeyPlan.addRule')}</Button>
              <Button type="button" size="sm" disabled={pending} onClick={saveRules}>{t('journeyPlan.saveRules')}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generator */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="text-sm font-semibold">{t('journeyPlan.generateTitle')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('journeyPlan.route')}</Label>
              <select value={routeId} onChange={(e) => onRoute(e.target.value)} className={selectCls}>
                <option value="">{t('journeyPlan.pickRoute')}</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{ar ? r.name_ar || r.name : r.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('journeyPlan.salesman')}</Label>
              <select value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} className={selectCls}>
                <option value="">{t('journeyPlan.noSalesman')}</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('journeyPlan.workingDays')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {VISIT_DAYS.map((d) => (
                <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                  className={`rounded-full border px-3 py-1 text-xs ${days.has(d.value) ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                  {d[locale]}
                </button>
              ))}
            </div>
          </div>
          <Button type="button" disabled={pending} onClick={generate}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {t('journeyPlan.generate')}
          </Button>
        </CardContent>
      </Card>

      {/* Proposal preview */}
      {proposal && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t('journeyPlan.proposalTitle')}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">{t('journeyPlan.graded', { n: proposal.gradedCount })}</Badge>
                {proposal.customerLevelCount > 0 && <Badge variant="success">{t('journeyPlan.fromCustomer', { n: proposal.customerLevelCount })}</Badge>}
                {proposal.ungradedCount > 0 && <Badge variant="warning">{t('journeyPlan.ungraded', { n: proposal.ungradedCount })}</Badge>}
                {proposal.conflicts.length > 0 && <Badge variant="destructive"><AlertTriangle className="h-3 w-3" /> {t('journeyPlan.conflicts', { n: proposal.conflicts.length })}</Badge>}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {proposal.dayPlans.map((dp) => {
                const ids = orderedIds(dp);
                return (
                  <div key={dp.day} className="rounded-md border p-2">
                    <p className="mb-1 text-xs font-semibold">{dayLabel(dp.day)} · {ids.length}</p>
                    <ol className="space-y-0.5 text-xs">
                      {ids.map((id, i) => (
                        <li key={id} className={proposal.conflicts.some((c) => c.customerId === id && c.day === dp.day) ? 'text-destructive' : ''}>
                          {i + 1}. {proposal.customerNames[id] ?? id}
                        </li>
                      ))}
                      {ids.length === 0 && <li className="text-muted-foreground">—</li>}
                    </ol>
                  </div>
                );
              })}
            </div>
            <Button type="button" disabled={pending} onClick={apply}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('journeyPlan.apply')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
