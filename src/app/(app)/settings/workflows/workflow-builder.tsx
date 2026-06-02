'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { GitBranch, Plus, Trash2, Power, Globe } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { createDefinition, addStep, deleteStep, setDefinitionActive, deleteDefinition } from './actions';

export interface WfDefinition { id: string; company_id: string | null; key: string; entity: string; name_ar: string | null; name_en: string | null; is_active: boolean }
export interface WfStep { id: string; definition_id: string; step_no: number; name_ar: string | null; approver_type: string; approver_ref: string | null; mode: string; required_approvals: number; condition: { when?: string; op?: string; value?: string } | null }

const APPROVER_TYPES = ['company_admin', 'role', 'user'];
const MODES = ['sequential', 'parallel'];

export function WorkflowBuilder({ definitions, steps, companyId }: { definitions: WfDefinition[]; steps: WfStep[]; companyId: string | null }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [nd, setNd] = useState({ key: '', entity: 'credit_limit_request', name_ar: '', name_en: '' });
  const [stepDraft, setStepDraft] = useState<Record<string, { stepNo: string; nameAr: string; approverType: string; approverRef: string; mode: string; quorum: string; threshold: string }>>({});

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    try { const r = await fn(); if (!r.ok) return toast.error(r.error ?? t('workflows.toast.error')); toast.success(ok); }
    catch { toast.error(t('workflows.toast.error')); } finally { setBusy(false); }
  }
  const draftFor = (id: string) => stepDraft[id] ?? { stepNo: '', nameAr: '', approverType: 'company_admin', approverRef: '', mode: 'sequential', quorum: '1', threshold: '' };
  const setDraft = (id: string, patch: Partial<ReturnType<typeof draftFor>>) =>
    setStepDraft((s) => ({ ...s, [id]: { ...draftFor(id), ...patch } }));

  const companyDefs = definitions.filter((d) => d.company_id === companyId);
  const globalDefs = definitions.filter((d) => d.company_id === null);
  const stepsOf = (defId: string) => steps.filter((s) => s.definition_id === defId).sort((a, b) => a.step_no - b.step_no);

  function DefCard({ d, editable }: { d: WfDefinition; editable: boolean }) {
    const dr = draftFor(d.id);
    return (
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{locale === 'ar' ? (d.name_ar || d.key) : (d.name_en || d.key)}</span>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">{d.key} · {d.entity}</span>
            {d.company_id === null && <Badge variant="secondary"><Globe className="me-1 h-3 w-3" />{t('workflows.global')}</Badge>}
            <Badge variant={d.is_active ? 'success' : 'secondary'}>{d.is_active ? t('workflows.active') : t('workflows.inactive')}</Badge>
          </div>
          {editable && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setDefinitionActive(d.id, !d.is_active), t('workflows.toast.saved'))}><Power className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => deleteDefinition(d.id), t('workflows.toast.deleted'))}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </div>
        {/* steps */}
        <div className="space-y-1">
          {stepsOf(d.id).map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
              <span>
                #{s.step_no} · {locale === 'ar' ? (s.name_ar || s.approver_type) : s.approver_type}
                {s.approver_ref ? ` (${s.approver_ref})` : ''} · {t(`workflows.mode.${s.mode}`)}
                {s.mode === 'parallel' ? ` · ${t('workflows.quorum')}: ${s.required_approvals}` : ''}
                {s.condition?.when ? ` · ${s.condition.when} ${s.condition.op} ${s.condition.value}` : ''}
              </span>
              {editable && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => deleteStep(s.id), t('workflows.toast.deleted'))}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          ))}
          {stepsOf(d.id).length === 0 && <p className="text-xs text-muted-foreground">{t('workflows.noSteps')}</p>}
        </div>
        {/* add step */}
        {editable && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 border-t pt-3">
            <Input className="h-9" type="number" placeholder="#" value={dr.stepNo} onChange={(e) => setDraft(d.id, { stepNo: e.target.value })} />
            <Input className="h-9" placeholder={t('workflows.step.name')} value={dr.nameAr} onChange={(e) => setDraft(d.id, { nameAr: e.target.value })} />
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={dr.approverType} onChange={(e) => setDraft(d.id, { approverType: e.target.value })}>
              {APPROVER_TYPES.map((a) => <option key={a} value={a}>{t(`workflows.approver.${a}`)}</option>)}
            </select>
            <Input className="h-9" placeholder={t('workflows.step.ref')} value={dr.approverRef} onChange={(e) => setDraft(d.id, { approverRef: e.target.value })} />
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={dr.mode} onChange={(e) => setDraft(d.id, { mode: e.target.value })}>
              {MODES.map((m) => <option key={m} value={m}>{t(`workflows.mode.${m}`)}</option>)}
            </select>
            <Input className="h-9" type="number" placeholder={t('workflows.quorum')} value={dr.quorum} onChange={(e) => setDraft(d.id, { quorum: e.target.value })} />
            <Input className="h-9" type="number" placeholder={t('workflows.thresholdAmount')} value={dr.threshold} onChange={(e) => setDraft(d.id, { threshold: e.target.value })} />
            <Button size="sm" className="col-span-2 sm:col-span-1" disabled={busy} onClick={() => run(() => addStep({
              definitionId: d.id, stepNo: parseInt(dr.stepNo || '1', 10), nameAr: dr.nameAr,
              approverType: dr.approverType, approverRef: dr.approverRef, mode: dr.mode,
              requiredApprovals: parseInt(dr.quorum || '1', 10),
              thresholdAmount: dr.threshold ? parseFloat(dr.threshold) : null,
            }), t('workflows.toast.stepAdded'))}>
              <Plus className="h-4 w-4" /> {t('workflows.addStep')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold"><GitBranch className="h-4 w-4" /> {t('workflows.create.title')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5"><Label>{t('workflows.create.key')}</Label><Input dir="ltr" value={nd.key} onChange={(e) => setNd({ ...nd, key: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t('workflows.create.entity')}</Label><Input dir="ltr" value={nd.entity} onChange={(e) => setNd({ ...nd, entity: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t('workflows.create.nameAr')}</Label><Input value={nd.name_ar} onChange={(e) => setNd({ ...nd, name_ar: e.target.value })} /></div>
            <div className="flex items-end"><Button disabled={busy} onClick={() => run(async () => { const r = await createDefinition(nd.key, nd.entity, nd.name_ar, nd.name_en); if (r.ok) setNd({ key: '', entity: 'credit_limit_request', name_ar: '', name_en: '' }); return r; }, t('workflows.toast.created'))}><Plus className="h-4 w-4" /> {t('workflows.create.submit')}</Button></div>
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-6 space-y-3">
        <h2 className="text-base font-semibold">{t('workflows.companyDefs')}</h2>
        {companyDefs.length === 0 ? <p className="text-sm text-muted-foreground">{t('workflows.noCompanyDefs')}</p>
          : companyDefs.map((d) => <DefCard key={d.id} d={d} editable />)}
      </CardContent></Card>

      <Card><CardContent className="p-6 space-y-3">
        <h2 className="text-base font-semibold">{t('workflows.globalTemplates')}</h2>
        {globalDefs.map((d) => <DefCard key={d.id} d={d} editable={false} />)}
      </CardContent></Card>
    </div>
  );
}
