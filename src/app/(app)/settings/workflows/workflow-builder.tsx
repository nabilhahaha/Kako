'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GitBranch, Plus, Trash2, Power, Globe, Lock, Building2, CheckCircle2, AlertTriangle, Rocket, Archive, Copy, FlaskConical, History, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { EVENT } from '@/lib/workflow/event-types';
import {
  createDefinition, deleteStep, setDefinitionActive, deleteDefinition,
  updateDefinition, upsertStep, validateDefinition, publishDefinition,
  archiveDefinition, cloneDefinition, simulateDefinition,
} from './actions';

// Phase-1 forms-based builder over the SINGLE engine (no canvas, no drag-&-drop,
// no execution logic in the UI). See WORKFLOW_BUILDER_SCREEN_TREE.md.

export interface WfDefinition {
  id: string; company_id: string | null; key: string; entity: string;
  name_ar: string | null; name_en: string | null; is_active: boolean;
  status?: string | null; version?: number | null; latest_version?: number | null;
  visibility?: string | null; owner_id?: string | null; description?: string | null;
  trigger_event?: string | null; trigger_config?: Record<string, unknown> | null; published_at?: string | null;
}
export interface WfStep {
  id: string; definition_id: string; step_no: number;
  name_ar: string | null; name?: string | null;
  approver_type: string | null; approver_ref: string | null; mode: string; required_approvals: number;
  step_type?: string | null; config?: Record<string, unknown> | null;
  condition: Record<string, unknown> | null;
  sla_hours?: number | null; escalate_to?: string | null;
  next_on_success?: string | null; next_on_failure?: string | null;
}
export interface WfVersion {
  id: string; definition_id: string; version: number;
  published_at: string | null; published_by: string | null;
}

const STEP_TYPES = ['approval', 'reject', 'notification', 'task', 'update_record', 'api_call', 'delay', 'escalation', 'condition'] as const;
const APPROVER_TYPES = ['company_admin', 'role', 'user'];
const MODES = ['sequential', 'parallel'];
const EVENTS = Object.values(EVENT);
const STATUS_FILTERS = ['all', 'draft', 'published', 'archived'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];
type Tab = 'overview' | 'trigger' | 'steps' | 'versions' | 'simulate';

const statusOf = (d: WfDefinition): string =>
  d.status ?? (d.is_active ? 'published' : 'draft');
const visOf = (d: WfDefinition): string =>
  d.visibility ?? (d.company_id === null ? 'global' : 'company');

interface SimTrace { state: string; executed: string[]; trace: { step_no: number; type: string; status: string; branch?: string; error: string | null; would?: string }[] }

export function WorkflowBuilder({
  definitions, steps, versions, companyId, userId,
}: {
  definitions: WfDefinition[]; steps: WfStep[]; versions: WfVersion[];
  companyId: string | null; userId: string;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [nd, setNd] = useState({ key: '', entity: 'credit_limit_request', name_ar: '', name_en: '' });
  const [errors, setErrors] = useState<string[] | null>(null);
  const [sim, setSim] = useState<SimTrace | null>(null);

  async function run<T>(fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, ok: string): Promise<{ ok: boolean; data?: T }> {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) { toast.error(r.error ?? t('workflows.toast.error')); return { ok: false }; }
      toast.success(ok); return { ok: true, data: r.data };
    } catch { toast.error(t('workflows.toast.error')); return { ok: false }; } finally { setBusy(false); }
  }

  const stepsOf = (defId: string) => steps.filter((s) => s.definition_id === defId).sort((a, b) => a.step_no - b.step_no);
  const versionsOf = (defId: string) => versions.filter((v) => v.definition_id === defId).sort((a, b) => b.version - a.version);
  const nameOf = (d: WfDefinition) => (locale === 'ar' ? (d.name_ar || d.key) : (d.name_en || d.name_ar || d.key));

  const visible = useMemo(() => definitions.filter((d) => {
    const v = visOf(d);
    if (v === 'private' && d.owner_id && d.owner_id !== userId) return false;
    return true;
  }), [definitions, userId]);

  const filtered = visible.filter((d) => {
    if (filter !== 'all' && statusOf(d) !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!`${d.key} ${d.entity} ${d.name_ar ?? ''} ${d.name_en ?? ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const selected = selectedId ? definitions.find((d) => d.id === selectedId) ?? null : null;
  const open = (id: string) => { setSelectedId(id); setTab('overview'); setErrors(null); setSim(null); };

  // ── Workflow List ────────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="space-y-6">
        {/* New workflow (Workflow List → New) */}
        <Card><CardContent className="p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold"><GitBranch className="h-4 w-4" /> {t('workflows.create.title')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5"><Label>{t('workflows.create.key')}</Label><Input dir="ltr" value={nd.key} onChange={(e) => setNd({ ...nd, key: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t('workflows.create.entity')}</Label><Input dir="ltr" value={nd.entity} onChange={(e) => setNd({ ...nd, entity: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t('workflows.create.nameAr')}</Label><Input value={nd.name_ar} onChange={(e) => setNd({ ...nd, name_ar: e.target.value })} /></div>
            <div className="flex items-end"><Button disabled={busy} onClick={async () => {
              const res = await run(async () => createDefinition(nd.key, nd.entity, nd.name_ar, nd.name_en), t('workflows.toast.created'));
              if (res.ok && res.data?.id) { setNd({ key: '', entity: 'credit_limit_request', name_ar: '', name_en: '' }); open(res.data.id); }
            }}><Plus className="h-4 w-4" /> {t('workflows.create.submit')}</Button></div>
          </div>
        </CardContent></Card>

        {/* List with filter chips + search */}
        <Card><CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>{t(`workflows.filter.${f}`)}</Button>
              ))}
            </div>
            <Input className="h-9 max-w-xs" placeholder={t('workflows.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filtered.length === 0 ? <p className="text-sm text-muted-foreground">{t('workflows.noCompanyDefs')}</p> : (
            <div className="space-y-2">
              {filtered.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <button className="flex flex-wrap items-center gap-2 text-start" onClick={() => open(d.id)}>
                    <span className="font-medium">{nameOf(d)}</span>
                    <span className="font-mono text-xs text-muted-foreground" dir="ltr">{d.key} · {d.entity}</span>
                    <StatusBadge status={statusOf(d)} t={t} />
                    <VisBadge vis={visOf(d)} t={t} />
                    {(d.latest_version ?? d.version) ? <span className="text-xs text-muted-foreground">v{d.latest_version ?? d.version}</span> : null}
                  </button>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => open(d.id)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => cloneDefinition(d.id, 'company'), t('workflows.toast.cloned'))}><Copy className="h-3.5 w-3.5" /></Button>
                    {statusOf(d) === 'archived'
                      ? <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => archiveDefinition(d.id, false), t('workflows.toast.saved'))}><Power className="h-3.5 w-3.5" /></Button>
                      : <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => archiveDefinition(d.id, true), t('workflows.toast.archived'))}><Archive className="h-3.5 w-3.5" /></Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>
    );
  }

  // ── Workflow Details (tabs) ───────────────────────────────────────────────
  const def = selected;
  const status = statusOf(def);
  const published = status === 'published';
  const editable = def.company_id === companyId || (def.company_id === null);
  const defSteps = stepsOf(def.id);
  const TABS: Tab[] = ['overview', 'trigger', 'steps', 'versions', 'simulate'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card><CardContent className="p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>← {t('workflows.backToList')}</Button>
            <span className="font-semibold">{nameOf(def)}</span>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">{def.key} · {def.entity}</span>
            <StatusBadge status={status} t={t} />
            <VisBadge vis={visOf(def)} t={t} />
            {(def.latest_version ?? def.version) ? <span className="text-xs text-muted-foreground">v{def.latest_version ?? def.version}</span> : null}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
              const res = await run(async () => validateDefinition(def.id), t('workflows.toast.validated'));
              if (res.ok && res.data) setErrors(res.data.errors);
            }}><CheckCircle2 className="me-1 h-3.5 w-3.5" />{t('workflows.validate')}</Button>
            <Button size="sm" disabled={busy || !editable} onClick={async () => {
              const res = await run(async () => publishDefinition(def.id), t('workflows.toast.published'));
              if (res.ok) setErrors(null);
            }}><Rocket className="me-1 h-3.5 w-3.5" />{t('workflows.publish')}</Button>
            {status === 'archived'
              ? <Button size="sm" variant="outline" disabled={busy || !editable} onClick={() => run(async () => archiveDefinition(def.id, false), t('workflows.toast.saved'))}><Power className="me-1 h-3.5 w-3.5" />{t('workflows.unarchive')}</Button>
              : <Button size="sm" variant="outline" disabled={busy || !editable} onClick={() => run(async () => archiveDefinition(def.id, true), t('workflows.toast.archived'))}><Archive className="me-1 h-3.5 w-3.5" />{t('workflows.archive')}</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => cloneDefinition(def.id, 'company'), t('workflows.toast.cloned'))}><Copy className="me-1 h-3.5 w-3.5" />{t('workflows.clone')}</Button>
            <Button size="sm" variant="outline" disabled={busy || !editable} onClick={() => run(async () => deleteDefinition(def.id).then((r) => { if (r.ok) setSelectedId(null); return r; }), t('workflows.toast.deleted'))}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        {published && <p className="text-xs text-amber-600">{t('workflows.publishedReadOnly')}</p>}
        {errors !== null && (
          errors.length === 0
            ? <p className="flex items-center gap-1 text-sm text-green-600"><CheckCircle2 className="h-4 w-4" />{t('workflows.validationPassed')}</p>
            : <ul className="space-y-0.5 rounded border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">{errors.map((e, i) => <li key={i} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</li>)}</ul>
        )}
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b pt-1">
          {TABS.map((tb) => (
            <button key={tb} className={`px-3 py-1.5 text-sm ${tab === tb ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`} onClick={() => setTab(tb)}>{t(`workflows.tab.${tb}`)}</button>
          ))}
        </div>
      </CardContent></Card>

      {tab === 'overview' && <OverviewTab def={def} editable={editable && !published} busy={busy} run={run} t={t} />}
      {tab === 'trigger' && <TriggerTab def={def} editable={editable && !published} busy={busy} run={run} t={t} />}
      {tab === 'steps' && <StepsTab def={def} steps={defSteps} editable={editable && !published} busy={busy} run={run} t={t} locale={locale} />}
      {tab === 'versions' && <VersionsTab versions={versionsOf(def.id)} t={t} />}
      {tab === 'simulate' && <SimulateTab def={def} busy={busy} run={run} t={t} sim={sim} setSim={setSim} />}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Runner = <T>(fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, ok: string) => Promise<{ ok: boolean; data?: T }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = (k: string, vars?: any) => string;

function StatusBadge({ status, t }: { status: string; t: T }) {
  const v = status === 'published' ? 'success' : status === 'archived' ? 'secondary' : 'outline';
  return <Badge variant={v as 'success' | 'secondary' | 'outline'}>{t(`workflows.status.${status}`)}</Badge>;
}
function VisBadge({ vis, t }: { vis: string; t: T }) {
  const Icon = vis === 'global' ? Globe : vis === 'private' ? Lock : Building2;
  return <Badge variant="secondary"><Icon className="me-1 h-3 w-3" />{t(`workflows.visibility.${vis}`)}</Badge>;
}

// ── Overview tab ────────────────────────────────────────────────────────────
function OverviewTab({ def, editable, busy, run, t }: { def: WfDefinition; editable: boolean; busy: boolean; run: Runner; t: T }) {
  const [f, setF] = useState({
    name_ar: def.name_ar ?? '', name_en: def.name_en ?? '', description: def.description ?? '',
    entity: def.entity, visibility: visOf(def),
  });
  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>{t('workflows.create.nameAr')}</Label><Input value={f.name_ar} disabled={!editable} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>{t('workflows.nameEn')}</Label><Input dir="ltr" value={f.name_en} disabled={!editable} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>{t('workflows.create.entity')}</Label><Input dir="ltr" value={f.entity} disabled={!editable} onChange={(e) => setF({ ...f, entity: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>{t('workflows.visibilityLabel')}</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.visibility} disabled={!editable} onChange={(e) => setF({ ...f, visibility: e.target.value })}>
            {['company', 'private', 'global'].map((v) => <option key={v} value={v}>{t(`workflows.visibility.${v}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2"><Label>{t('workflows.description')}</Label><Input value={f.description} disabled={!editable} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      </div>
      {editable && <Button disabled={busy} onClick={() => run(async () => updateDefinition(def.id, f), t('workflows.toast.saved'))}>{t('workflows.saveDraft')}</Button>}
    </CardContent></Card>
  );
}

// ── Trigger tab (Trigger Editor) ─────────────────────────────────────────────
function TriggerTab({ def, editable, busy, run, t }: { def: WfDefinition; editable: boolean; busy: boolean; run: Runner; t: T }) {
  const [mode, setMode] = useState<'manual' | 'event'>(def.trigger_event ? 'event' : 'manual');
  const [event, setEvent] = useState(def.trigger_event ?? EVENTS[0]);
  const [cfg, setCfg] = useState(JSON.stringify(def.trigger_config ?? {}, null, 2));
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>{t('workflows.triggerMode')}</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={mode} disabled={!editable} onChange={(e) => setMode(e.target.value as 'manual' | 'event')}>
            <option value="manual">{t('workflows.triggerManual')}</option>
            <option value="event">{t('workflows.triggerEvent')}</option>
          </select>
        </div>
        {mode === 'event' && (
          <div className="space-y-1.5"><Label>{t('workflows.triggerEventLabel')}</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" dir="ltr" value={event} disabled={!editable} onChange={(e) => setEvent(e.target.value)}>
              {EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="space-y-1.5"><Label>{t('workflows.triggerConfig')}</Label>
        <textarea className="min-h-[120px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs" dir="ltr" value={cfg} disabled={!editable} onChange={(e) => setCfg(e.target.value)} />
        {cfgErr && <p className="text-xs text-destructive">{cfgErr}</p>}
        <p className="text-xs text-muted-foreground">{t('workflows.triggerConfigHint')}</p>
      </div>
      {editable && <Button disabled={busy} onClick={() => {
        let parsed: Record<string, unknown> = {};
        if (cfg.trim()) { try { parsed = JSON.parse(cfg); setCfgErr(null); } catch { setCfgErr(t('workflows.invalidJson')); return; } }
        run(async () => updateDefinition(def.id, { triggerEvent: mode === 'event' ? event : null, triggerConfig: parsed }), t('workflows.toast.saved'));
      }}>{t('workflows.saveDraft')}</Button>}
    </CardContent></Card>
  );
}

// ── Steps tab (Step Editor + Condition Editor) ───────────────────────────────
const emptyStep = {
  id: '' as string, step_no: '', step_type: 'approval', name: '', config: '{}',
  approver_type: 'company_admin', approver_ref: '', sla_hours: '', escalate_to: '',
  next_on_success: '', next_on_failure: '', condition: '',
};
function StepsTab({ def, steps, editable, busy, run, t, locale }: { def: WfDefinition; steps: WfStep[]; editable: boolean; busy: boolean; run: Runner; t: T; locale: string }) {
  const [d, setD] = useState({ ...emptyStep, step_no: String((steps.at(-1)?.step_no ?? 0) + 1) });
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const editStep = (s: WfStep) => setD({
    id: s.id, step_no: String(s.step_no), step_type: s.step_type ?? 'approval', name: s.name ?? s.name_ar ?? '',
    config: JSON.stringify(s.config ?? {}, null, 2), approver_type: s.approver_type ?? 'company_admin',
    approver_ref: s.approver_ref ?? '', sla_hours: s.sla_hours != null ? String(s.sla_hours) : '',
    escalate_to: s.escalate_to ?? '', next_on_success: s.next_on_success ?? '', next_on_failure: s.next_on_failure ?? '',
    condition: s.condition ? JSON.stringify(s.condition, null, 2) : '',
  });
  const reset = () => setD({ ...emptyStep, step_no: String((steps.at(-1)?.step_no ?? 0) + 1) });

  return (
    <Card><CardContent className="p-6 space-y-4">
      {/* existing steps */}
      <div className="space-y-1">
        {steps.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">#{s.step_no}</Badge>
              <span className="font-medium">{t(`workflows.stepType.${s.step_type ?? 'approval'}`)}</span>
              <span>{locale === 'ar' ? (s.name ?? s.name_ar ?? '') : (s.name ?? '')}</span>
              {s.approver_type ? <span className="text-muted-foreground">· {t(`workflows.approver.${s.approver_type}`)}{s.approver_ref ? ` (${s.approver_ref})` : ''}</span> : null}
              {s.sla_hours ? <span className="text-muted-foreground">· SLA {s.sla_hours}h</span> : null}
              {s.next_on_success || s.next_on_failure ? <span className="text-xs text-muted-foreground">· →</span> : null}
            </span>
            {editable && (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => editStep(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => deleteStep(s.id), t('workflows.toast.deleted'))}><Trash2 className="h-3.5 w-3.5" /></Button>
              </span>
            )}
          </div>
        ))}
        {steps.length === 0 && <p className="text-xs text-muted-foreground">{t('workflows.noSteps')}</p>}
      </div>

      {/* add / edit step form */}
      {editable && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">{d.id ? t('workflows.editStep') : t('workflows.addStep')}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>{t('workflows.stepNo')}</Label><Input type="number" value={d.step_no} onChange={(e) => setD({ ...d, step_no: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t('workflows.stepTypeLabel')}</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={d.step_type} onChange={(e) => setD({ ...d, step_type: e.target.value })}>
                {STEP_TYPES.map((s) => <option key={s} value={s}>{t(`workflows.stepType.${s}`)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>{t('workflows.step.name')}</Label><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          </div>

          {/* approval-specific fields */}
          {(d.step_type === 'approval' || d.step_type === 'escalation') && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>{t('workflows.approverType')}</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={d.approver_type} onChange={(e) => setD({ ...d, approver_type: e.target.value })}>
                  {APPROVER_TYPES.map((a) => <option key={a} value={a}>{t(`workflows.approver.${a}`)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>{t('workflows.step.ref')}</Label><Input value={d.approver_ref} onChange={(e) => setD({ ...d, approver_ref: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t('workflows.slaHours')}</Label><Input type="number" value={d.sla_hours} onChange={(e) => setD({ ...d, sla_hours: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t('workflows.escalateTo')}</Label><Input value={d.escalate_to} onChange={(e) => setD({ ...d, escalate_to: e.target.value })} /></div>
            </div>
          )}

          {/* condition editor (condition step) */}
          {d.step_type === 'condition' && (
            <div className="space-y-1.5"><Label>{t('workflows.conditionExpr')}</Label>
              <textarea className="min-h-[90px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs" dir="ltr" value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value })} placeholder='{ "all": [ { "field": "amount", "op": "gt", "value": 1000 } ] }' />
            </div>
          )}

          {/* generic config (notification/task/update_record/api_call/delay) */}
          {!['reject'].includes(d.step_type) && (
            <div className="space-y-1.5"><Label>{t('workflows.stepConfig')}</Label>
              <textarea className="min-h-[90px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs" dir="ltr" value={d.config} onChange={(e) => setD({ ...d, config: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t(`workflows.configHint.${d.step_type}`)}</p>
            </div>
          )}

          {/* branch targets */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t('workflows.nextOnSuccess')}</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={d.next_on_success} onChange={(e) => setD({ ...d, next_on_success: e.target.value })}>
                <option value="">{t('workflows.branchSequential')}</option>
                {steps.filter((s) => s.id !== d.id).map((s) => <option key={s.id} value={s.id}>#{s.step_no} {t(`workflows.stepType.${s.step_type ?? 'approval'}`)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>{t('workflows.nextOnFailure')}</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={d.next_on_failure} onChange={(e) => setD({ ...d, next_on_failure: e.target.value })}>
                <option value="">{t('workflows.branchStop')}</option>
                {steps.filter((s) => s.id !== d.id).map((s) => <option key={s.id} value={s.id}>#{s.step_no} {t(`workflows.stepType.${s.step_type ?? 'approval'}`)}</option>)}
              </select>
            </div>
          </div>
          {cfgErr && <p className="text-xs text-destructive">{cfgErr}</p>}

          <div className="flex gap-2">
            <Button disabled={busy} onClick={async () => {
              let config: Record<string, unknown> = {};
              if (d.config.trim()) { try { config = JSON.parse(d.config); } catch { setCfgErr(t('workflows.invalidJson')); return; } }
              let condition: Record<string, unknown> | null = null;
              if (d.condition.trim()) { try { condition = JSON.parse(d.condition); } catch { setCfgErr(t('workflows.invalidJson')); return; } }
              setCfgErr(null);
              const res = await run(async () => upsertStep({
                id: d.id || undefined, definitionId: def.id, stepNo: parseInt(d.step_no || '1', 10),
                stepType: d.step_type, name: d.name, config, condition,
                approverType: ['approval', 'escalation'].includes(d.step_type) ? d.approver_type : null,
                approverRef: d.approver_ref || null,
                slaHours: d.sla_hours ? parseInt(d.sla_hours, 10) : null,
                escalateTo: d.escalate_to || null,
                nextOnSuccess: d.next_on_success || null, nextOnFailure: d.next_on_failure || null,
              }), d.id ? t('workflows.toast.saved') : t('workflows.toast.stepAdded'));
              if (res.ok) reset();
            }}><Plus className="h-4 w-4" /> {d.id ? t('workflows.saveStep') : t('workflows.addStep')}</Button>
            {d.id && <Button variant="outline" disabled={busy} onClick={reset}>{t('workflows.cancel')}</Button>}
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}

// ── Versions tab ──────────────────────────────────────────────────────────────
function VersionsTab({ versions, t }: { versions: WfVersion[]; t: T }) {
  return (
    <Card><CardContent className="p-6 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4" />{t('workflows.tab.versions')}</h3>
      {versions.length === 0 ? <p className="text-sm text-muted-foreground">{t('workflows.noVersions')}</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-start text-muted-foreground"><th className="py-1 text-start">{t('workflows.version')}</th><th className="py-1 text-start">{t('workflows.publishedAt')}</th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-b"><td className="py-1.5">v{v.version}</td><td className="py-1.5 text-muted-foreground">{v.published_at ? new Date(v.published_at).toLocaleString() : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-muted-foreground">{t('workflows.versionsImmutable')}</p>
    </CardContent></Card>
  );
}

// ── Simulate tab (Simulation Screen) ──────────────────────────────────────────
function SimulateTab({ def, busy, run, t, sim, setSim }: { def: WfDefinition; busy: boolean; run: Runner; t: T; sim: SimTrace | null; setSim: (s: SimTrace | null) => void }) {
  const [recordId, setRecordId] = useState('');
  const [contextJson, setContextJson] = useState('{}');
  return (
    <Card><CardContent className="p-6 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-medium"><FlaskConical className="h-4 w-4" />{t('workflows.tab.simulate')}</h3>
      <p className="text-xs text-muted-foreground">{t('workflows.simulateHint')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>{t('workflows.create.entity')}</Label><Input dir="ltr" value={def.entity} disabled /></div>
        <div className="space-y-1.5"><Label>{t('workflows.recordId')}</Label><Input dir="ltr" value={recordId} onChange={(e) => setRecordId(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label>{t('workflows.contextOverrides')}</Label>
        <textarea className="min-h-[90px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs" dir="ltr" value={contextJson} onChange={(e) => setContextJson(e.target.value)} />
      </div>
      <Button disabled={busy} onClick={async () => {
        const res = await run(async () => simulateDefinition({ definitionId: def.id, entity: def.entity, recordId, contextJson }), t('workflows.toast.simulated'));
        if (res.ok && res.data) setSim(res.data as SimTrace);
      }}><FlaskConical className="me-1 h-4 w-4" />{t('workflows.runSimulation')}</Button>
      {sim && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm"><span className="font-medium">{t('workflows.simState')}:</span> <Badge variant="outline">{sim.state}</Badge></p>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-start text-muted-foreground"><th className="py-1 text-start">#</th><th className="py-1 text-start">{t('workflows.stepTypeLabel')}</th><th className="py-1 text-start">{t('workflows.simStatus')}</th><th className="py-1 text-start">{t('workflows.simBranch')}</th></tr></thead>
            <tbody>
              {sim.trace.map((tr, i) => (
                <tr key={i} className="border-b"><td className="py-1">{tr.step_no}</td><td className="py-1">{tr.type}</td><td className="py-1">{tr.status}{tr.error ? ` — ${tr.error}` : ''}</td><td className="py-1 text-muted-foreground">{tr.branch ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardContent></Card>
  );
}
