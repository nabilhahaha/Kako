'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, X, Info, ChevronRight, UserPlus, FileEdit, PauseCircle, StopCircle, Repeat, Crosshair, Route as RouteIcon, GitBranch, CheckCircle2, Bell, Paperclip, Upload, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { RP_TICKET_TYPES, RP_TICKET_STATUSES, type RpTicketType, type RpTicketStatus } from '@/lib/erp/route-planner-backend';
import { REQUEST_FORMS, OPTION_SETS, validateRequest, buildDetails, primaryGps, type FormField } from '@/lib/erp/route-planner-request-forms';
import { createRequest, listRequests, transitionRequest, getRequestApproval, advanceRequest, listMyApprovals, type RequestApprovalView } from './rp-backend-actions';
import { listAttachments, uploadAttachment, type AttachmentView } from '@/app/(app)/attachments/actions';

/** Entity key for Request Center evidence in the shared erp_attachments system. */
const ATTACH_ENTITY = 'route_planner_request';

type Req = Record<string, unknown>;

/** Allowed forward transitions per status — keeps the workflow coherent in the UI.
 *  (The action layer + RLS are the authority; this just drives the buttons.) */
const NEXT: Record<RpTicketStatus, RpTicketStatus[]> = {
  created: ['pending_manager_review', 'cancelled'],
  pending_manager_review: ['approved', 'need_more_info', 'rejected'],
  need_more_info: ['pending_manager_review', 'cancelled'],
  approved: ['pending_admin_action'],
  pending_admin_action: ['implemented_externally', 'need_more_info'],
  implemented_externally: ['closed'],
  closed: [],
  rejected: [],
  cancelled: [],
};

/** Icon per ticket type — drives the empty-state type cards and the list. */
const TYPE_ICON: Record<RpTicketType, LucideIcon> = {
  new_customer: UserPlus, update: FileEdit, temp_stop: PauseCircle, perm_stop: StopCircle,
  reassignment: Repeat, location_fix: Crosshair, route_change: RouteIcon,
};

/** Overdue = an OPEN ticket that has been sitting longer than the aging threshold. */
const OVERDUE_DAYS = 7;
const OPEN_STATUSES: RpTicketStatus[] = ['created', 'pending_manager_review', 'approved', 'pending_admin_action', 'need_more_info'];
function isOverdue(r: Record<string, unknown>): boolean {
  if (!OPEN_STATUSES.includes(String(r.status) as RpTicketStatus)) return false;
  const created = r.created_at ? new Date(String(r.created_at)).getTime() : NaN;
  return Number.isFinite(created) && Date.now() - created > OVERDUE_DAYS * 86_400_000;
}

const STATUS_TONE: Record<string, string> = {
  created: 'bg-slate-100 text-slate-700',
  pending_manager_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-sky-100 text-sky-700',
  pending_admin_action: 'bg-indigo-100 text-indigo-700',
  implemented_externally: 'bg-violet-100 text-violet-700',
  closed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  need_more_info: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

/**
 * Request Center — lightweight, trackable tickets for customer-master & route requests.
 * Routing and tracking ONLY: the system never edits official master data. An approved
 * ticket is implemented by the Admin in the external system, then closed here. Visibility
 * follows the reporting graph (RLS); this UI surfaces what the caller may see.
 */
export function RequestCenterView({ meId = null }: { meId?: string | null }) {
  const { t } = useI18n();
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'all' | 'mine' | 'approvals'>('all');
  const [myApprovalIds, setMyApprovalIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<RpTicketStatus | 'all' | 'overdue'>('all');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Req | null>(null);
  const [approval, setApproval] = useState<RequestApprovalView | null>(null);
  const [wfBusy, setWfBusy] = useState(false);
  const [atts, setAtts] = useState<AttachmentView[]>([]);
  const [attBusy, setAttBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // create form — schema-driven per ticket type
  const [type, setType] = useState<RpTicketType>('new_customer');
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    setLoading(true);
    const [r, a] = await Promise.all([listRequests(), listMyApprovals()]);
    if (r.ok) setRequests((r.data as Req[]) ?? []);
    else setMsg(r.error);
    if (a.ok) setMyApprovalIds(new Set(a.data!.ids));
    setLoading(false);
  }

  const form = REQUEST_FORMS[type];
  // Scope (All / My Requests / My Approvals) then the status/overdue filter.
  const scoped = scope === 'mine' ? requests.filter((r) => meId && String(r.requested_by) === meId)
    : scope === 'approvals' ? requests.filter((r) => myApprovalIds.has(String(r.id)))
    : requests;
  const shown = filter === 'all' ? scoped
    : filter === 'overdue' ? scoped.filter(isOverdue)
    : scoped.filter((r) => String(r.status) === filter);

  // Operational KPIs over ALL requests (independent of the active filter).
  const kpis = useMemo(() => {
    const by = (sts: RpTicketStatus[]) => requests.filter((r) => sts.includes(String(r.status) as RpTicketStatus)).length;
    return {
      total: requests.length,
      review: by(['pending_manager_review', 'need_more_info']),
      impl: by(['approved', 'pending_admin_action']),
      closed: by(['closed', 'implemented_externally']),
      overdue: requests.filter(isOverdue).length,
    };
  }, [requests]);

  function setVal(k: string, v: string) { setValues((s) => ({ ...s, [k]: v })); }

  async function submit() {
    setMsg(null);
    const missing = validateRequest(form, values);
    if (missing.length) { setErrors(missing); return; }
    setErrors([]); setBusy(true);
    const gps = primaryGps(form, values);
    const r = await createRequest({
      type,
      customerRef: values[form.customerRefKey]?.trim() || null,
      reason: form.reasonKey ? values[form.reasonKey]?.trim() || undefined : undefined,
      details: buildDetails(form, values),
      gpsLat: gps?.lat ?? null, gpsLng: gps?.lng ?? null,
    });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setCreating(false); setValues({});
    await refresh();
  }

  async function move(id: string, status: RpTicketStatus) {
    setMsg(null);
    const r = await transitionRequest(id, status);
    if (!r.ok) { setMsg(r.error); return; }
    await refresh();
    setSelected((s) => (s && String(s.id) === id ? { ...s, status } : s));
  }

  // Load the live approval state + attachments whenever a ticket is opened.
  useEffect(() => {
    if (!selected) { setApproval(null); setAtts([]); return; }
    let live = true;
    setApproval(null); setAtts([]);
    const id = String(selected.id);
    void getRequestApproval(id).then((r) => { if (live && r.ok) setApproval(r.data!); });
    void listAttachments(ATTACH_ENTITY, id).then((a) => { if (live) setAtts(a); });
    return () => { live = false; };
  }, [selected]);

  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !selected) return;
    setAttBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append('entity', ATTACH_ENTITY); fd.append('record_id', String(selected.id)); fd.append('file', file);
    const r = await uploadAttachment(fd);
    setAttBusy(false);
    if (e.target) e.target.value = '';
    if (!r.ok) { setMsg(t('rpShell.rc_att_failed')); return; }
    setAtts(await listAttachments(ATTACH_ENTITY, String(selected.id)));
  }

  async function act(action: 'approve' | 'reject' | 'need_info') {
    if (!selected) return;
    setWfBusy(true); setMsg(null);
    const r = await advanceRequest(String(selected.id), action);
    setWfBusy(false);
    if (!r.ok) { setMsg(wfError(r.error)); return; }
    const a = await getRequestApproval(String(selected.id));
    if (a.ok) setApproval(a.data!);
    setSelected((s) => (s ? { ...s, status: r.data!.status } : s));
    await refresh();
  }
  function wfError(code: string) {
    const m: Record<string, string> = {
      err_not_authorized: t('rpShell.rc_wf_errAuth'), err_already_done: t('rpShell.rc_wf_errDone'),
      err_no_flow: t('rpShell.rc_wf_errNoFlow'),
    };
    return m[code] ?? code;
  }

  function openCreate(preset?: RpTicketType) {
    setType(preset ?? 'new_customer');
    setValues({}); setErrors([]); setSelected(null); setCreating(true);
  }

  const isEmpty = !loading && requests.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /><p className="text-sm font-bold">{t('rpShell.g_requests')}</p></div>
        <Button size="sm" onClick={() => openCreate()}><Plus className="h-4 w-4" /> {t('rpShell.rc_new')}</Button>
      </div>

      <div className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{t('rpShell.rc_disclaimer')}</span>
      </div>

      {/* Notification — pending approvals waiting on me. */}
      {meId && myApprovalIds.size > 0 && scope !== 'approvals' && (
        <button onClick={() => setScope('approvals')} className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-start text-xs text-amber-900 hover:bg-amber-100">
          <Bell className="h-4 w-4 shrink-0" />
          <span className="font-medium">{t('rpShell.rc_notifyApprovals').replace('{n}', String(myApprovalIds.size))}</span>
          <ChevronRight className="ms-auto h-4 w-4 rtl:rotate-180" />
        </button>
      )}

      {/* Scope: All / My Requests / My Approvals. */}
      {meId && !isEmpty && (
        <div className="flex flex-wrap gap-1.5">
          {([['all', t('rpShell.rc_scopeAll')], ['mine', t('rpShell.rc_scopeMine')], ['approvals', t('rpShell.rc_scopeApprovals')]] as const).map(([s, label]) => (
            <button key={s} onClick={() => setScope(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${scope === s ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
              {label}
              {s === 'approvals' && myApprovalIds.size > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white" dir="ltr">{myApprovalIds.size}</span>}
            </button>
          ))}
        </div>
      )}

      {/* KPI summary — clickable quick-filters above the grid. */}
      {!isEmpty && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <KpiTile label={t('rpShell.rc_kpi_total')} value={kpis.total} tone="slate" active={filter === 'all'} onClick={() => setFilter('all')} />
          <KpiTile label={t('rpShell.rc_kpi_pendingReview')} value={kpis.review} tone="amber" active={filter === 'pending_manager_review'} onClick={() => setFilter('pending_manager_review')} />
          <KpiTile label={t('rpShell.rc_kpi_pendingImpl')} value={kpis.impl} tone="indigo" active={filter === 'pending_admin_action'} onClick={() => setFilter('pending_admin_action')} />
          <KpiTile label={t('rpShell.rc_kpi_closed')} value={kpis.closed} tone="emerald" active={filter === 'closed'} onClick={() => setFilter('closed')} />
          <KpiTile label={t('rpShell.rc_kpi_overdue')} value={kpis.overdue} tone="red" active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
        </div>
      )}

      {/* Status filter — only once there are requests to filter. */}
      {!isEmpty && (
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...RP_TICKET_STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${filter === s ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
              {s === 'all' ? t('rpShell.rc_all') : t(`rpShell.rc_status_${s}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      )}

      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{msg}</p>}

      {/* First-time empty state — guide the user to create their first request. */}
      {isEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto rounded-lg border border-dashed py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ClipboardList className="h-7 w-7" /></div>
          <p className="mt-3 text-base font-bold">{t('rpShell.rc_emptyTitle')}</p>
          <p className="mt-1 max-w-md px-4 text-sm text-muted-foreground">{t('rpShell.rc_emptyHint')}</p>
          <Button className="mt-4" onClick={() => openCreate()}><Plus className="h-4 w-4" /> {t('rpShell.rc_new')}</Button>
          <p className="mt-6 mb-2 text-xs font-semibold text-muted-foreground">{t('rpShell.rc_pickType')}</p>
          <div className="grid w-full max-w-2xl grid-cols-2 gap-2 px-4 sm:grid-cols-3 lg:grid-cols-4">
            {RP_TICKET_TYPES.map((ty) => {
              const Icon = TYPE_ICON[ty];
              return (
                <button key={ty} onClick={() => openCreate(ty)}
                  className="flex items-center gap-2 rounded-xl border p-3 text-start transition hover:border-primary hover:bg-primary/5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><Icon className="h-4 w-4" /></span>
                  <span className="text-xs font-medium">{t(`rpShell.rc_type_${ty}` as Parameters<typeof t>[0])}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
      /* List */
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
        {loading ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t('routePlanner.importing')}</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t('rpShell.rc_noMatch')}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted"><tr>
              <th className="px-3 py-2 text-start font-semibold">{t('rpShell.rc_ticket')}</th>
              <th className="px-3 py-2 text-start font-semibold">{t('rpShell.rc_type')}</th>
              <th className="px-3 py-2 text-start font-semibold">{t('rpShell.rc_customer')}</th>
              <th className="px-3 py-2 text-start font-semibold">{t('rpShell.rc_status')}</th>
              <th className="px-3 py-2 text-start font-semibold">{t('rpShell.intg_when')}</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={String(r.id)} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => { setSelected(r); setCreating(false); }}>
                <td className="px-3 py-2 font-medium" dir="ltr">{String(r.ticket_no ?? '—')}</td>
                <td className="px-3 py-2">{t(`rpShell.rc_type_${String(r.type)}` as Parameters<typeof t>[0])}</td>
                <td className="truncate px-3 py-2">{String(r.customer_ref ?? '—')}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[String(r.status)] ?? 'bg-muted'}`}>{t(`rpShell.rc_status_${String(r.status)}` as Parameters<typeof t>[0])}</span></td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" dir="ltr">{r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2 text-muted-foreground"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      )}

      {/* Create slide-over — schema-driven smart form per ticket type */}
      {creating && (
        <Drawer title={t('rpShell.rc_new')} onClose={() => setCreating(false)}>
          <label className="block text-xs font-medium">{t('rpShell.rc_type')}</label>
          <select value={type} onChange={(e) => { setType(e.target.value as RpTicketType); setErrors([]); }} className="w-full rounded-md border px-2 py-2 text-sm">
            {RP_TICKET_TYPES.map((ty) => <option key={ty} value={ty}>{t(`rpShell.rc_type_${ty}` as Parameters<typeof t>[0])}</option>)}
          </select>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{t(`rpShell.${form.descKey}` as Parameters<typeof t>[0])}</p>

          {errors.length > 0 && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              <p className="font-medium">{t('rpShell.rc_fixErrors')}</p>
              <p>{errors.map((lk) => t(`rpShell.${lk}` as Parameters<typeof t>[0])).join('، ')}</p>
            </div>
          )}

          <div className="mt-1">
            {form.fields.map((f) => (
              <FieldInput key={f.key} field={f} values={values} setVal={setVal} type={type} setType={setType} invalid={errors.includes(f.labelKey)} t={t} />
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setCreating(false)}>{t('dayPlanner.back')}</Button>
            <Button size="sm" onClick={submit} disabled={busy}>{busy ? t('routePlanner.importing') : t('rpShell.rc_submit')}</Button>
          </div>
        </Drawer>
      )}

      {/* Detail slide-over */}
      {selected && !creating && (
        <Drawer title={String(selected.ticket_no ?? t('rpShell.rc_ticket'))} onClose={() => setSelected(null)}>
          <Field label={t('rpShell.rc_type')} value={t(`rpShell.rc_type_${String(selected.type)}` as Parameters<typeof t>[0])} />
          <Field label={t('rpShell.rc_customer')} value={String(selected.customer_ref ?? '—')} />
          <Field label={t('rpShell.rc_status')}>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[String(selected.status)] ?? 'bg-muted'}`}>{t(`rpShell.rc_status_${String(selected.status)}` as Parameters<typeof t>[0])}</span>
          </Field>
          {(selected.gps_lat != null && selected.gps_lng != null) ? <Field label={t('rpShell.rc_gps')} value={`${selected.gps_lat}, ${selected.gps_lng}`} /> : null}

          {/* Submitted request details (per-type fields). Routing/tracking only. */}
          <DetailFields request={selected} t={t} />

          {/* Attachments / photo evidence (shared erp_attachments store). */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold"><Paperclip className="h-3.5 w-3.5 text-primary" /> {t('rpShell.rc_att_title')} {atts.length > 0 && <span className="text-muted-foreground">({atts.length})</span>}</p>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> {attBusy ? t('routePlanner.importing') : t('rpShell.rc_att_add')}
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={onAttach} disabled={attBusy} />
              </label>
            </div>
            {atts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t('rpShell.rc_att_none')}</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {atts.map((a) => (
                  <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-md border" title={a.file_name}>
                    {a.mime_type?.startsWith('image/') && a.url
                      ? <img src={a.url} alt={a.file_name} className="h-16 w-full object-cover" />
                      : <div className="flex h-16 w-full items-center justify-center bg-muted text-muted-foreground"><Paperclip className="h-4 w-4" /></div>}
                    <p className="truncate px-1 py-0.5 text-[10px] text-muted-foreground">{a.file_name}</p>
                  </a>
                ))}
              </div>
            )}
          </div>

          {approval?.hasFlow ? (
            /* Enforced workflow — driven by the configured Approval Builder flow. */
            <div className="mt-4 rounded-lg border p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><GitBranch className="h-3.5 w-3.5 text-primary" /> {t('rpShell.rc_wf_title')}</p>
              {approval.done ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {t('rpShell.rc_wf_done')}</p>
              ) : approval.pending ? (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{t(`rpShell.ab_stage_${approval.pending.stage}` as Parameters<typeof t>[0])}</span>
                    <span className="text-muted-foreground">{t(`rpShell.ab_mode_${approval.pending.mode}` as Parameters<typeof t>[0])}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t('rpShell.rc_wf_awaiting')}: {approval.pending.assignees.length ? approval.pending.assignees.map((a) => a.name).join('، ') : t('rpShell.rc_wf_noAssignee')}</p>
                  {approval.pending.canAct ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Button size="sm" onClick={() => act('approve')} disabled={wfBusy}><CheckCircle2 className="h-4 w-4" /> {t('rpShell.rc_wf_approve')}</Button>
                      <Button size="sm" variant="outline" onClick={() => act('need_info')} disabled={wfBusy}>{t('rpShell.rc_wf_needInfo')}</Button>
                      <Button size="sm" variant="outline" onClick={() => act('reject')} disabled={wfBusy} className="text-red-600">{t('rpShell.rc_wf_reject')}</Button>
                    </div>
                  ) : (
                    <p className="mt-2 rounded bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">{t('rpShell.rc_wf_cannotAct')}</p>
                  )}
                </>
              ) : null}
            </div>
          ) : (
            /* No flow configured for this type → manual status transitions. */
            <>
              <p className="mt-4 mb-1.5 text-xs font-semibold">{t('rpShell.rc_moveTo')}</p>
              <div className="flex flex-wrap gap-1.5">
                {(NEXT[String(selected.status) as RpTicketStatus] ?? []).map((ns) => (
                  <Button key={ns} size="sm" variant="outline" onClick={() => move(String(selected.id), ns)}>
                    {t(`rpShell.rc_status_${ns}` as Parameters<typeof t>[0])}
                  </Button>
                ))}
                {(NEXT[String(selected.status) as RpTicketStatus] ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">{t('rpShell.rc_terminal')}</span>
                )}
              </div>
            </>
          )}

          <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">{t('rpShell.rc_disclaimer')}</p>
        </Drawer>
      )}
    </div>
  );
}

const KPI_TONE: Record<string, string> = {
  slate: 'text-slate-700', amber: 'text-amber-700', indigo: 'text-indigo-700', emerald: 'text-emerald-700', red: 'text-red-700',
};
function KpiTile({ label, value, tone, active, onClick }: { label: string; value: number; tone: keyof typeof KPI_TONE | string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-lg border p-2.5 text-start transition hover:bg-muted/40 ${active ? 'border-primary ring-1 ring-primary/30' : ''}`}>
      <p className={`text-xl font-bold tabular-nums ${KPI_TONE[tone] ?? ''}`} dir="ltr">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </button>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-y-0 end-0 w-full max-w-md overflow-y-auto bg-background p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold" dir="ltr">{title}</p>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {children ?? <p className="text-sm">{value}</p>}
    </div>
  );
}

const INPUT = 'w-full rounded-md border px-2 py-2 text-sm';

/** One schema-driven form control with a required/optional label and mobile-friendly sizing. */
function FieldInput({ field, values, setVal, type, setType, invalid, t }: {
  field: FormField; values: Record<string, string>; setVal: (k: string, v: string) => void;
  type: RpTicketType; setType: (t: RpTicketType) => void; invalid: boolean; t: ReturnType<typeof useI18n>['t'];
}) {
  const tk = (k: string) => t(k as Parameters<typeof t>[0]);
  const label = (
    <label className="mt-3 flex items-center gap-1.5 text-xs font-medium">
      {tk(`rpShell.${field.labelKey}`)}
      {field.required ? <span className="text-red-500">*</span> : <span className="text-[10px] font-normal text-muted-foreground">{t('rpShell.rc_optional')}</span>}
    </label>
  );
  const cls = `${INPUT} ${invalid ? 'border-red-400 bg-red-50/40' : ''}`;
  const hint = field.hintKey ? <p className="mt-0.5 text-[10px] text-muted-foreground">{tk(`rpShell.${field.hintKey}`)}</p> : null;

  if (field.kind === 'attachments') {
    return <div>{label}<div className="rounded-md border border-dashed bg-muted/40 px-3 py-3 text-center text-[11px] text-muted-foreground">{tk(`rpShell.${field.hintKey ?? 'rc_h_attachments'}`)}</div></div>;
  }
  if (field.kind === 'stopType') {
    return <div>{label}
      <select value={type} onChange={(e) => setType(e.target.value as RpTicketType)} className={INPUT}>
        <option value="temp_stop">{t('rpShell.rc_type_temp_stop')}</option>
        <option value="perm_stop">{t('rpShell.rc_type_perm_stop')}</option>
      </select></div>;
  }
  if (field.kind === 'gps') {
    return <div>{label}
      <div className="flex gap-2">
        <input value={values[`${field.key}_lat`] ?? ''} onChange={(e) => setVal(`${field.key}_lat`, e.target.value)} placeholder={t('dayPlanner.f_lat')} dir="ltr" inputMode="decimal" className={cls} />
        <input value={values[`${field.key}_lng`] ?? ''} onChange={(e) => setVal(`${field.key}_lng`, e.target.value)} placeholder={t('dayPlanner.f_lng')} dir="ltr" inputMode="decimal" className={cls} />
      </div>{hint}</div>;
  }
  if (field.kind === 'select' && field.options) {
    return <div>{label}
      <select value={values[field.key] ?? ''} onChange={(e) => setVal(field.key, e.target.value)} className={cls}>
        <option value="">{t('rpShell.rc_choose')}</option>
        {OPTION_SETS[field.options].map((code) => <option key={code} value={code}>{tk(`rpShell.rc_opt_${field.options}_${code}`)}</option>)}
      </select>{hint}</div>;
  }
  if (field.kind === 'textarea') {
    return <div>{label}<textarea value={values[field.key] ?? ''} onChange={(e) => setVal(field.key, e.target.value)} rows={3} className={cls} />{hint}</div>;
  }
  const inputType = field.kind === 'number' ? 'number' : field.kind === 'tel' ? 'tel' : field.kind === 'date' ? 'date' : 'text';
  const extra = field.kind === 'number' ? { inputMode: 'decimal' as const } : field.kind === 'tel' ? { inputMode: 'tel' as const, dir: 'ltr' as const } : field.kind === 'date' ? { dir: 'ltr' as const } : {};
  return <div>{label}<input type={inputType} value={values[field.key] ?? ''} onChange={(e) => setVal(field.key, e.target.value)} className={cls} {...extra} />{hint}</div>;
}

/** Renders the submitted per-type detail fields (read-only) in the ticket detail drawer. */
function DetailFields({ request, t }: { request: Record<string, unknown>; t: ReturnType<typeof useI18n>['t'] }) {
  const type = String(request.type) as RpTicketType;
  const form = REQUEST_FORMS[type];
  const changes = (request.changes && typeof request.changes === 'object') ? request.changes as Record<string, unknown> : {};
  const rows = form.fields.filter((f) => f.kind !== 'attachments' && f.kind !== 'stopType' && !f.primaryGps && changes[f.key] != null);
  if (rows.length === 0) return null;
  const val = (f: FormField, v: unknown): string => {
    if (v == null) return '—';
    if (f.kind === 'gps' && typeof v === 'object') { const o = v as { lat?: number; lng?: number }; return `${o.lat}, ${o.lng}`; }
    if (f.kind === 'select' && f.options) return t(`rpShell.rc_opt_${f.options}_${String(v)}` as Parameters<typeof t>[0]);
    return String(v);
  };
  return <div className="mt-1 rounded-md border bg-muted/20 p-2">{rows.map((f) => (
    <Field key={f.key} label={t(`rpShell.${f.labelKey}` as Parameters<typeof t>[0])} value={val(f, changes[f.key])} />
  ))}</div>;
}
