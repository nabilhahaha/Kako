'use client';

import { useEffect, useState } from 'react';
import { Inbox, MapPin, Clock, Plus, Check, X, HelpCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getRequestCenter, RP_REQUEST_TYPES, type RequestRow, type RpRequestStatus, type RpRequestType } from './rp-requests-read-actions';
import { getMyRequestPerms, submitRequest, decideRequest, type RequestDecision } from './rp-request-write-actions';

/**
 * Phase C3 (read) + D2 (write) — Route Planner request center. Lists requests with their
 * approval status; lets any company member SUBMIT a request and managers/admins DECIDE
 * (approve / reject / need-info) on others' requests. Self-approval is blocked server-side.
 */
const STATUS_TINT: Record<RpRequestStatus, string> = {
  created: 'bg-slate-100 text-slate-700',
  pending_manager_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  pending_admin_action: 'bg-blue-100 text-blue-800',
  implemented_externally: 'bg-teal-100 text-teal-800',
  closed: 'bg-zinc-100 text-zinc-700',
  rejected: 'bg-red-100 text-red-800',
  need_more_info: 'bg-violet-100 text-violet-800',
  cancelled: 'bg-zinc-100 text-zinc-500',
};
const OPEN: ReadonlySet<RpRequestStatus> = new Set(['created', 'pending_manager_review', 'pending_admin_action', 'need_more_info']);

export function RequestCenterPanel() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [perms, setPerms] = useState<{ canSubmit: boolean; canDecide: boolean }>({ canSubmit: false, canDecide: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ type: RpRequestType; customerRef: string; reason: string }>({ type: 'new_customer', customerRef: '', reason: '' });

  async function refresh() {
    const res = await getRequestCenter();
    if (res.ok) { setRows(res.data.rows); setOpenCount(res.data.openCount); }
    setLoaded(true);
  }
  useEffect(() => {
    void (async () => {
      await refresh();
      const p = await getMyRequestPerms();
      if (p.ok) setPerms({ canSubmit: p.data.canSubmit, canDecide: p.data.canDecide });
    })();
  }, []);

  const dateFmt = (s: string) => new Date(s).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' });

  async function onSubmit() {
    if (!form.reason.trim()) return;
    setBusy(true); setMsg(null);
    const res = await submitRequest({ type: form.type, customerRef: form.customerRef || null, reason: form.reason });
    setBusy(false);
    if (res.ok) { setForm({ type: 'new_customer', customerRef: '', reason: '' }); setShowForm(false); setMsg({ tone: 'ok', text: t('rpReq.submitted') }); await refresh(); }
    else setMsg({ tone: 'err', text: t('rpReq.err') + ' ' + res.error });
  }
  async function onDecide(id: string, decision: RequestDecision) {
    setBusy(true); setMsg(null);
    const res = await decideRequest(id, decision);
    setBusy(false);
    if (res.ok) { setMsg({ tone: 'ok', text: t('rpReq.decided') }); await refresh(); }
    else setMsg({ tone: 'err', text: t('rpReq.err') + ' ' + res.error });
  }

  if (!loaded) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('rpReq.loading')}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Inbox className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold">{t('rpReq.title')}</p>
        <span className="text-[11px] text-muted-foreground">{t('rpReq.openOf', { open: openCount, total: rows.length })}</span>
        <div className="flex-1" />
        {perms.canSubmit && (
          <button onClick={() => setShowForm((v) => !v)} disabled={busy}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> {t('rpReq.newRequest')}
          </button>
        )}
      </div>

      {msg && <p className={`rounded-md border px-3 py-1.5 text-xs ${msg.tone === 'err' ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{msg.text}</p>}

      {showForm && perms.canSubmit && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
          <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">{t('rpReq.fType')}
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RpRequestType })} className="rounded border px-2 py-1 text-xs text-foreground">
              {RP_REQUEST_TYPES.map((ty) => <option key={ty} value={ty}>{t(`rpReq.type_${ty}` as 'rpReq.type_update')}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">{t('rpReq.fCustomer')}
            <input value={form.customerRef} onChange={(e) => setForm({ ...form, customerRef: e.target.value })} className="rounded border px-2 py-1 text-xs text-foreground" placeholder={t('rpReq.fCustomerPh')} />
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-0.5 text-[11px] text-muted-foreground">{t('rpReq.fReason')}
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="rounded border px-2 py-1 text-xs text-foreground" placeholder={t('rpReq.fReasonPh')} />
          </label>
          <button onClick={() => void onSubmit()} disabled={busy || !form.reason.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{t('rpReq.submit')}</button>
          <button onClick={() => setShowForm(false)} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs">{t('rpReq.cancel')}</button>
        </div>
      )}

      {rows.length === 0 && !showForm && <p className="rounded-lg border px-3 py-6 text-center text-xs text-muted-foreground">{t('rpReq.empty')}</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_ticket')}</th>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_type')}</th>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_customer')}</th>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_status')}</th>
                <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_date')}</th>
                {perms.canDecide && <th className="px-2.5 py-1.5 text-start font-semibold">{t('rpReq.col_actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-2.5 py-1.5 font-mono text-[11px]">{r.ticketNo ?? '—'}</td>
                  <td className="px-2.5 py-1.5">{t(`rpReq.type_${r.type}` as 'rpReq.type_update')}</td>
                  <td className="px-2.5 py-1.5"><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{r.customerRef ?? '—'}</span></td>
                  <td className="px-2.5 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TINT[r.status]}`}>{t(`rpReq.st_${r.status}` as 'rpReq.st_created')}</span></td>
                  <td className="px-2.5 py-1.5 text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{dateFmt(r.createdAt)}</span></td>
                  {perms.canDecide && (
                    <td className="px-2.5 py-1.5">
                      {OPEN.has(r.status) && !r.mine ? (
                        <div className="flex items-center gap-1">
                          <button title={t('rpReq.approve')} onClick={() => void onDecide(r.id, 'approve')} disabled={busy} className="rounded border border-emerald-300 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><Check className="h-3 w-3" /></button>
                          <button title={t('rpReq.reject')} onClick={() => void onDecide(r.id, 'reject')} disabled={busy} className="rounded border border-red-300 bg-red-50 p-1 text-red-700 hover:bg-red-100 disabled:opacity-50"><X className="h-3 w-3" /></button>
                          <button title={t('rpReq.needInfo')} onClick={() => void onDecide(r.id, 'need_info')} disabled={busy} className="rounded border border-violet-300 bg-violet-50 p-1 text-violet-700 hover:bg-violet-100 disabled:opacity-50"><HelpCircle className="h-3 w-3" /></button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{r.mine ? t('rpReq.ownRequest') : '—'}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{perms.canDecide ? t('rpReq.decideHint') : t('rpReq.readNote')}</p>
    </div>
  );
}
