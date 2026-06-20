'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Plus, X, MapPin, Info, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { RP_TICKET_TYPES, RP_TICKET_STATUSES, RP_PROOF_REQUIRED, type RpTicketType, type RpTicketStatus } from '@/lib/erp/route-planner-backend';
import { createRequest, listRequests, transitionRequest } from './rp-backend-actions';

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
export function RequestCenterView() {
  const { t } = useI18n();
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RpTicketStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Req | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // create form
  const [type, setType] = useState<RpTicketType>('update');
  const [customerRef, setCustomerRef] = useState('');
  const [reason, setReason] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    setLoading(true);
    const r = await listRequests();
    if (r.ok) setRequests((r.data as Req[]) ?? []);
    else setMsg(r.error);
    setLoading(false);
  }

  const proofNeeded = RP_PROOF_REQUIRED.includes(type);
  const shown = filter === 'all' ? requests : requests.filter((r) => String(r.status) === filter);

  async function submit() {
    setMsg(null); setBusy(true);
    const r = await createRequest({
      type, customerRef: customerRef.trim() || null, reason: reason.trim() || undefined,
      gpsLat: lat ? Number(lat) : null, gpsLng: lng ? Number(lng) : null,
    });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setCreating(false); setCustomerRef(''); setReason(''); setLat(''); setLng(''); setType('update');
    await refresh();
  }

  async function move(id: string, status: RpTicketStatus) {
    setMsg(null);
    const r = await transitionRequest(id, status);
    if (!r.ok) { setMsg(r.error); return; }
    await refresh();
    setSelected((s) => (s && String(s.id) === id ? { ...s, status } : s));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /><p className="text-sm font-bold">{t('rpShell.g_requests')}</p></div>
        <Button size="sm" onClick={() => { setCreating(true); setSelected(null); }}><Plus className="h-4 w-4" /> {t('rpShell.rc_new')}</Button>
      </div>

      <div className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{t('rpShell.rc_disclaimer')}</span>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', ...RP_TICKET_STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${filter === s ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
            {s === 'all' ? t('rpShell.rc_all') : t(`rpShell.rc_status_${s}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{msg}</p>}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
        {loading ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t('routePlanner.importing')}</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t('rpShell.rc_empty')}</p>
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

      {/* Create slide-over */}
      {creating && (
        <Drawer title={t('rpShell.rc_new')} onClose={() => setCreating(false)}>
          <label className="block text-xs font-medium">{t('rpShell.rc_type')}</label>
          <select value={type} onChange={(e) => setType(e.target.value as RpTicketType)} className="w-full rounded-md border px-2 py-1.5 text-sm">
            {RP_TICKET_TYPES.map((ty) => <option key={ty} value={ty}>{t(`rpShell.rc_type_${ty}` as Parameters<typeof t>[0])}</option>)}
          </select>

          <label className="mt-3 block text-xs font-medium">{t('rpShell.rc_customer')}</label>
          <input value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder={t('rpShell.rc_customerHint')} className="w-full rounded-md border px-2 py-1.5 text-sm" />

          <label className="mt-3 block text-xs font-medium">{t('rpShell.rc_reason')}</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-md border px-2 py-1.5 text-sm" />

          {proofNeeded && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2">
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-800"><MapPin className="h-3.5 w-3.5" /> {t('rpShell.rc_gpsRequired')}</p>
              <div className="flex gap-2">
                <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder={t('dayPlanner.f_lat')} dir="ltr" className="w-1/2 rounded-md border px-2 py-1.5 text-sm" />
                <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder={t('dayPlanner.f_lng')} dir="ltr" className="w-1/2 rounded-md border px-2 py-1.5 text-sm" />
              </div>
            </div>
          )}

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
          {selected.reason ? <Field label={t('rpShell.rc_reason')} value={String(selected.reason)} /> : null}
          {(selected.gps_lat != null && selected.gps_lng != null) ? <Field label={t('rpShell.rc_gps')} value={`${selected.gps_lat}, ${selected.gps_lng}`} /> : null}

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

          <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">{t('rpShell.rc_disclaimer')}</p>
        </Drawer>
      )}
    </div>
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
