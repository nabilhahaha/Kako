'use client';

import { useEffect, useMemo, useState } from 'react';
import { GitBranch, Plus, Trash2, ArrowUp, ArrowDown, Info, CheckCircle2, Save, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import {
  RP_TICKET_TYPES, RP_PLAN_APPROVAL_TYPES, RP_APPROVAL_STAGES, RP_ASSIGN_METHODS, RP_RELATIONS, RP_ROLES, RP_STEP_MODES, RP_APPROVAL_TEMPLATES,
  type RpApprovalKey, type RpApprovalStep, type RpApprovalStage, type RpAssignMethod, type RpRelation, type RpRole, type RpStepMode,
} from '@/lib/erp/route-planner-backend';
import { listApprovalFlows, saveApprovalFlow } from './rp-backend-actions';
import { listReportingGraph } from './rp-reporting-actions';

type TemplateKey = keyof typeof RP_APPROVAL_TEMPLATES;
const TEMPLATE_KEYS = Object.keys(RP_APPROVAL_TEMPLATES) as TemplateKey[];

/**
 * Approval Builder — optional, per-ticket-type configurable approval flows on
 * erp_rp_approval_flows. Each step assigns by Role, Reporting Line (uses the reporting
 * graph), or a Specific User. Routing/tracking only: approving a ticket never edits
 * official master data — the admin implements the approved change externally, then closes.
 */
export function ApprovalBuilderView() {
  const { t } = useI18n();
  const [flows, setFlows] = useState<Record<string, { steps: RpApprovalStep[]; isActive: boolean }>>({});
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<RpApprovalKey>('new_customer');
  const [steps, setSteps] = useState<RpApprovalStep[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const [f, g] = await Promise.all([listApprovalFlows(), listReportingGraph()]);
    if (f.ok) {
      const map: Record<string, { steps: RpApprovalStep[]; isActive: boolean }> = {};
      for (const row of f.data!) map[row.ticketType] = { steps: row.steps, isActive: row.isActive };
      setFlows(map);
    }
    if (g.ok) setUsers(g.data!.nodes.map((n) => ({ id: n.userId, name: n.name })));
    setLoading(false);
  }

  // When the selected type or loaded flows change, hydrate the editor.
  useEffect(() => {
    const f = flows[selected];
    setSteps(f ? f.steps.map((s) => ({ ...s })) : []);
    setIsActive(f ? f.isActive : true);
    setMsg(null);
  }, [selected, flows]);

  const nameOf = useMemo(() => { const m = new Map(users.map((u) => [u.id, u.name])); return (id?: string) => (id ? m.get(id) ?? id.slice(0, 8) : ''); }, [users]);

  function update(i: number, patch: Partial<RpApprovalStep>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  }
  function setAssignBy(i: number, method: RpAssignMethod) {
    const base: RpApprovalStep = { stage: steps[i].stage, assignBy: method };
    if (method === 'role') base.role = RP_ROLES[0];
    else if (method === 'relation') base.relation = 'direct_manager';
    else if (method === 'user') base.userId = users[0]?.id;
    setSteps((s) => s.map((st, idx) => (idx === i ? base : st)));
  }
  function addStep() { setSteps((s) => [...s, { stage: 'approve', assignBy: 'relation', relation: 'direct_manager' }]); }
  function move(i: number, dir: -1 | 1) {
    setSteps((s) => { const a = [...s]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  }
  function remove(i: number) { setSteps((s) => s.filter((_, idx) => idx !== i)); }
  function applyTemplate(k: TemplateKey) { setSteps(RP_APPROVAL_TEMPLATES[k].map((s) => ({ ...s }))); }

  async function save() {
    setBusy(true); setMsg(null);
    const r = await saveApprovalFlow(selected, steps, isActive);
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setFlows((m) => ({ ...m, [selected]: { steps, isActive } }));
    setMsg(t('rpShell.ab_saved'));
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('routePlanner.importing')}</div>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-primary" /><p className="text-sm font-bold">{t('rpShell.g_admin')} · {t('rpShell.i_approvalBuilder')}</p></div>
      <div className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{t('rpShell.ab_intro')}</span>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_1fr]">
        {/* Ticket-type list */}
        <div className="overflow-y-auto rounded-lg border p-1.5">
          <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">{t('rpShell.ab_pickType')}</p>
          {RP_TICKET_TYPES.map((ty) => {
            const f = flows[ty]; const configured = f && f.steps.length > 0;
            return (
              <button key={ty} onClick={() => setSelected(ty)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-xs transition ${selected === ty ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
                <span>{t(`rpShell.rc_type_${ty}` as Parameters<typeof t>[0])}</span>
                {configured ? <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 text-[9px] ${f!.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}><CheckCircle2 className="h-2.5 w-2.5" /> {f!.steps.length}</span> : null}
              </button>
            );
          })}
          {/* Plan sign-off flows (Wave K) — same engine, different keys. */}
          <p className="mt-2 border-t px-2 pb-1 pt-2 text-[11px] font-semibold text-muted-foreground">{t('rpShell.ab_planFlows')}</p>
          {RP_PLAN_APPROVAL_TYPES.map((ty) => {
            const f = flows[ty]; const configured = f && f.steps.length > 0;
            return (
              <button key={ty} onClick={() => setSelected(ty)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-xs transition ${selected === ty ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
                <span>{t(`rpShell.rc_type_${ty}` as Parameters<typeof t>[0])}</span>
                {configured ? <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 text-[9px] ${f!.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}><CheckCircle2 className="h-2.5 w-2.5" /> {f!.steps.length}</span> : null}
              </button>
            );
          })}
        </div>

        {/* Editor */}
        <div className="flex min-h-0 flex-col overflow-y-auto rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t(`rpShell.rc_type_${selected}` as Parameters<typeof t>[0])}</p>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> {t('rpShell.ab_active')}</label>
          </div>

          {/* Templates */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> {t('rpShell.ab_applyTemplate')}:</span>
            {TEMPLATE_KEYS.map((k) => (
              <button key={k} onClick={() => applyTemplate(k)} className="rounded-full border px-2.5 py-1 text-[11px] hover:bg-muted">{t(`rpShell.ab_tpl_${k}` as Parameters<typeof t>[0])}</button>
            ))}
            {steps.length > 0 && <button onClick={() => setSteps([])} className="text-[11px] text-muted-foreground hover:text-red-600">{t('rpShell.ab_clear')}</button>}
          </div>

          {/* Steps */}
          {steps.length === 0 ? (
            <div className="mt-3 flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
              <GitBranch className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-medium">{t('rpShell.ab_noFlow')}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t('rpShell.ab_noFlowHint')}</p>
              <Button size="sm" className="mt-3" onClick={addStep}><Plus className="h-4 w-4" /> {t('rpShell.ab_addStep')}</Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {steps.map((st, i) => (
                <div key={i} className="rounded-lg border p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(i)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="text-[11px]">
                      <span className="mb-0.5 block font-medium text-muted-foreground">{t('rpShell.ab_stage')}</span>
                      <select value={st.stage} onChange={(e) => update(i, { stage: e.target.value as RpApprovalStage })} className="w-full rounded border bg-background px-1.5 py-1.5 text-xs">
                        {RP_APPROVAL_STAGES.map((s) => <option key={s} value={s}>{t(`rpShell.ab_stage_${s}` as Parameters<typeof t>[0])}</option>)}
                      </select>
                    </label>
                    <label className="text-[11px]">
                      <span className="mb-0.5 block font-medium text-muted-foreground">{t('rpShell.ab_assignBy')}</span>
                      <select value={st.assignBy} onChange={(e) => setAssignBy(i, e.target.value as RpAssignMethod)} className="w-full rounded border bg-background px-1.5 py-1.5 text-xs">
                        {RP_ASSIGN_METHODS.map((m) => <option key={m} value={m}>{t(`rpShell.ab_by_${m}` as Parameters<typeof t>[0])}</option>)}
                      </select>
                    </label>
                    <label className="text-[11px]">
                      <span className="mb-0.5 block font-medium text-muted-foreground">{t('rpShell.ab_target')}</span>
                      {st.assignBy === 'role' ? (
                        <select value={st.role ?? ''} onChange={(e) => update(i, { role: e.target.value as RpRole })} className="w-full rounded border bg-background px-1.5 py-1.5 text-xs">
                          {RP_ROLES.map((r) => <option key={r} value={r}>{t(`rpShell.ab_role_${r}` as Parameters<typeof t>[0])}</option>)}
                        </select>
                      ) : st.assignBy === 'relation' ? (
                        <select value={st.relation ?? ''} onChange={(e) => update(i, { relation: e.target.value as RpRelation })} className="w-full rounded border bg-background px-1.5 py-1.5 text-xs">
                          {RP_RELATIONS.map((r) => <option key={r} value={r}>{t(`rpShell.ab_rel_${r}` as Parameters<typeof t>[0])}</option>)}
                        </select>
                      ) : (
                        <select value={st.userId ?? ''} onChange={(e) => update(i, { userId: e.target.value })} className="w-full rounded border bg-background px-1.5 py-1.5 text-xs">
                          {users.length === 0 ? <option value="">—</option> : users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                    </label>
                  </div>
                  {/* Step semantics: All Of / Any Of + Skip if empty */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2 text-[11px]">
                    <label className="flex items-center gap-1.5">
                      <span className="font-medium text-muted-foreground">{t('rpShell.ab_mode')}</span>
                      <select value={st.mode ?? 'all'} onChange={(e) => update(i, { mode: e.target.value as RpStepMode })} className="rounded border bg-background px-1.5 py-1">
                        {RP_STEP_MODES.map((m) => <option key={m} value={m}>{t(`rpShell.ab_mode_${m}` as Parameters<typeof t>[0])}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={!!st.skipIfEmpty} onChange={(e) => update(i, { skipIfEmpty: e.target.checked })} />
                      {t('rpShell.ab_skipIfEmpty')}
                    </label>
                  </div>
                </div>
              ))}
              <button onClick={addStep} className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs text-muted-foreground hover:bg-muted"><Plus className="h-3.5 w-3.5" /> {t('rpShell.ab_addStep')}</button>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
            {msg ? <span className="text-xs text-emerald-700">{msg}</span> : <span />}
            <Button size="sm" onClick={save} disabled={busy}><Save className="h-4 w-4" /> {busy ? t('routePlanner.importing') : t('rpShell.ab_save')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
