'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Plus, Save, Trash2, ChevronUp, ChevronDown, Loader2, Pencil, ArrowDown, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { ConditionOp } from '@/lib/erp/form-rules';
import { ensureFormWorkflow, addStep, updateStep, deleteStep, reorderSteps } from './workflow-actions';

export interface WfStep {
  id: string; definition_id: string; step_no: number; approver_type: string; approver_ref: string | null;
  mode: 'sequential' | 'parallel'; required_approvals: number;
  condition: { when?: string; op?: string; value?: string } | null;
}
export interface RoleOpt { key: string; name_ar: string }
export interface MemberOpt { id: string; full_name: string | null; email: string | null }

const APPROVER_TYPES = ['company_admin', 'role', 'user', 'manager', 'department_head', 'route_owner', 'account_owner'];
const REF_TYPES = ['role', 'user']; // approver types that require a reference
const MODES: ('sequential' | 'parallel')[] = ['sequential', 'parallel'];
const COND_OPS: ConditionOp[] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'exists'];
const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

interface StepEdit {
  id?: string; approverType: string; approverRef: string; mode: 'sequential' | 'parallel'; quorum: string;
  condWhen: string; condOp: ConditionOp; condValue: string;
}
const blankStep = (): StepEdit => ({ approverType: 'company_admin', approverRef: '', mode: 'sequential', quorum: '1', condWhen: '', condOp: 'eq', condValue: '' });
function editFromStep(s: WfStep): StepEdit {
  return {
    id: s.id, approverType: s.approver_type, approverRef: s.approver_ref ?? '', mode: s.mode,
    quorum: String(s.required_approvals ?? 1),
    condWhen: s.condition?.when ?? '', condOp: (s.condition?.op as ConditionOp) ?? 'eq', condValue: s.condition?.value != null ? String(s.condition.value) : '',
  };
}

export function WorkflowPanel({
  formId, definitionId, definitionKey, steps, roles, members, fieldKeys, readOnly,
}: {
  formId: string; definitionId: string | null; definitionKey: string | null;
  steps: WfStep[]; roles: RoleOpt[]; members: MemberOpt[]; fieldKeys: string[]; readOnly: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<StepEdit | null>(null);

  const ordered = [...steps].sort((a, b) => a.step_no - b.step_no);

  function refLabel(s: WfStep): string | null {
    if (s.approver_type === 'role') return roles.find((r) => r.key === s.approver_ref)?.name_ar ?? s.approver_ref;
    if (s.approver_type === 'user') { const m = members.find((u) => u.id === s.approver_ref); return m ? (m.full_name || m.email || s.approver_ref) : s.approver_ref; }
    return null;
  }

  function createWorkflow() {
    start(async () => {
      const res = await ensureFormWorkflow(formId);
      if (!res.ok) { toast.error(res.error ?? t('forms.toast.error')); return; }
      toast.success(t('forms.toast.wfCreated'));
      router.refresh();
    });
  }

  function saveStep() {
    if (!edit || !definitionId) return;
    const payload = {
      formId, definitionId,
      approverType: edit.approverType,
      approverRef: REF_TYPES.includes(edit.approverType) ? edit.approverRef : undefined,
      mode: edit.mode, requiredApprovals: Math.max(1, parseInt(edit.quorum || '1', 10)),
      condWhen: edit.condWhen.trim() || undefined, condOp: edit.condOp, condValue: edit.condValue,
    };
    start(async () => {
      const res = edit.id ? await updateStep({ ...payload, stepId: edit.id }) : await addStep(payload);
      if (!res.ok) { toast.error(res.error ?? t('forms.toast.error')); return; }
      toast.success(t('forms.toast.stepSaved'));
      setEdit(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => { const res = await deleteStep(formId, id); if (!res.ok) toast.error(res.error ?? t('forms.toast.error')); else { toast.success(t('forms.toast.stepDeleted')); router.refresh(); } });
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...ordered];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    start(async () => { const res = await reorderSteps(formId, next.map((s) => s.id)); if (!res.ok) toast.error(res.error ?? t('forms.toast.error')); else router.refresh(); });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><GitBranch className="h-4 w-4" /> {t('forms.wf.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('forms.wf.subtitle')}</p>
          </div>
          {definitionKey && <Badge variant="secondary" className="font-mono" >{t('forms.wf.boundTo')}: <span dir="ltr" className="ms-1">{definitionKey}</span></Badge>}
        </div>

        {!definitionId ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="mb-3 text-sm text-muted-foreground">{t('forms.wf.notBound')}</p>
            {!readOnly && <Button size="sm" disabled={pending} onClick={createWorkflow}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('forms.wf.createWorkflow')}</Button>}
          </div>
        ) : (
          <>
            {/* ── Visualization chain ── */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('forms.wf.visTitle')}</p>
              {ordered.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{t('forms.wf.noSteps')}</p>}
              <ol className="space-y-2">
                {ordered.map((s, i) => {
                  const ref = refLabel(s);
                  return (
                    <li key={s.id}>
                      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">{s.step_no}</span>
                          <span className="font-medium">{t(`forms.wf.approver.${s.approver_type}`)}</span>
                          {ref && <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{ref}</Badge>}
                          <Badge variant="secondary">{t(`forms.wf.mode.${s.mode}`)}</Badge>
                          {s.mode === 'parallel' && <Badge variant="secondary">{t('forms.wf.quorum')}: {s.required_approvals}</Badge>}
                          {s.condition?.when && <Badge className="font-mono" variant="outline" dir="ltr">{s.condition.when} {s.condition.op} {String(s.condition.value)}</Badge>}
                        </div>
                        {!readOnly && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => move(i, -1)}><ChevronUp className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => move(i, 1)}><ChevronDown className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEdit(editFromStep(s))}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        )}
                      </div>
                      {i < ordered.length - 1 && (
                        <div className="flex items-center justify-center py-0.5 text-muted-foreground">
                          <ArrowDown className="h-3.5 w-3.5" />
                          <span className="ms-1 text-[11px]">{s.mode === 'parallel' ? t('forms.wf.par') : t('forms.wf.seq')}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {!readOnly && !edit && <Button size="sm" variant="outline" onClick={() => setEdit(blankStep())}><Plus className="h-4 w-4" /> {t('forms.wf.addStep')}</Button>}
            </div>

            {/* ── Step editor ── */}
            {!readOnly && edit && (
              <div className="space-y-3 rounded-md border bg-background p-3">
                <p className="text-sm font-medium">{edit.id ? t('forms.wf.editStep') : t('forms.wf.addStep')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>{t('forms.wf.approverType')}</Label>
                    <select className={selectCls} value={edit.approverType} onChange={(e) => setEdit({ ...edit, approverType: e.target.value, approverRef: '' })}>
                      {APPROVER_TYPES.map((a) => <option key={a} value={a}>{t(`forms.wf.approver.${a}`)}</option>)}
                    </select>
                  </div>
                  {edit.approverType === 'role' && (
                    <div className="space-y-1">
                      <Label>{t('forms.wf.approverRef')}</Label>
                      <select className={selectCls} value={edit.approverRef} onChange={(e) => setEdit({ ...edit, approverRef: e.target.value })}>
                        <option value="">{t('forms.wf.pickRole')}</option>
                        {roles.map((r) => <option key={r.key} value={r.key}>{r.name_ar}</option>)}
                      </select>
                    </div>
                  )}
                  {edit.approverType === 'user' && (
                    <div className="space-y-1">
                      <Label>{t('forms.wf.approverRef')}</Label>
                      <select className={selectCls} value={edit.approverRef} onChange={(e) => setEdit({ ...edit, approverRef: e.target.value })}>
                        <option value="">{t('forms.wf.pickUser')}</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email || m.id}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label>{t('forms.wf.modeLabel')}</Label>
                    <select className={selectCls} value={edit.mode} onChange={(e) => setEdit({ ...edit, mode: e.target.value as 'sequential' | 'parallel' })}>
                      {MODES.map((m) => <option key={m} value={m}>{t(`forms.wf.mode.${m}`)}</option>)}
                    </select>
                  </div>
                  {edit.mode === 'parallel' && (
                    <div className="space-y-1"><Label>{t('forms.wf.quorum')}</Label><Input type="number" min={1} dir="ltr" value={edit.quorum} onChange={(e) => setEdit({ ...edit, quorum: e.target.value })} /></div>
                  )}
                </div>

                {/* condition */}
                <div className="space-y-1">
                  <Label>{t('forms.wf.condition')}</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {fieldKeys.length > 0 ? (
                      <select className={selectCls} value={edit.condWhen} onChange={(e) => setEdit({ ...edit, condWhen: e.target.value })}>
                        <option value="">{t('forms.wf.condAlways')}</option>
                        {fieldKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    ) : (
                      <Input dir="ltr" placeholder={t('forms.wf.condWhen')} value={edit.condWhen} onChange={(e) => setEdit({ ...edit, condWhen: e.target.value })} />
                    )}
                    <select className={selectCls} value={edit.condOp} disabled={!edit.condWhen} onChange={(e) => setEdit({ ...edit, condOp: e.target.value as ConditionOp })}>{COND_OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                    <Input dir="ltr" placeholder={t('forms.wf.condValue')} disabled={!edit.condWhen || edit.condOp === 'exists'} value={edit.condValue} onChange={(e) => setEdit({ ...edit, condValue: e.target.value })} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('forms.wf.condHint')}</p>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={saveStep}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('forms.wf.saveStep')}</Button>
                  <Button size="sm" variant="outline" onClick={() => setEdit(null)}>{t('forms.cancel')}</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
