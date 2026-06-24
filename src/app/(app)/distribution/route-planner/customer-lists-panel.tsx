'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle, Archive, RotateCcw, Repeat, Trash2, Upload, BarChart3, Database, X } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import {
  listFvCustomerLists, archiveFvList, restoreFvList, deleteUnverifiedFromList, getUnverifiedCount,
} from './rp-customer-lists-actions';
import type { FvCustomerList } from './fv-customer-lists';
import { partitionLists } from './fv-customer-lists';

type Msg = { tone: 'ok' | 'err'; text: string } | null;
type Modal =
  | { kind: 'archive' | 'replace'; list: FvCustomerList }
  | { kind: 'delete'; list: FvCustomerList; count: number | null }
  | null;

/**
 * FV Setup → Customer Lists (admin). Safely manage uploaded FV customer lists: Archive
 * (default safe action — hides the list from rep Nearby/Assigned/Map, keeps history),
 * Restore, Replace Active List (archive current → reuse the existing upload flow), and
 * Delete Unverified Only (removes ONLY rows with no verification; the server RPC's NOT EXISTS
 * guard makes deleting verified history impossible). Company-scoped + field_verification.admin
 * gated by the page. No "Delete All Customers" action.
 */
export function CustomerListsPanel() {
  const { t, locale } = useI18n();
  const [lists, setLists] = useState<FvCustomerList[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [modal, setModal] = useState<Modal>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listFvCustomerLists();
    if (res.ok) setLists(res.data);
    else setMsg({ tone: 'err', text: res.error });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { year: 'numeric', month: 'short', day: 'numeric' });
  const scrollToUpload = () => { document.getElementById('fv-upload')?.scrollIntoView({ behavior: 'smooth' }); };

  async function openDelete(list: FvCustomerList) {
    setMsg(null);
    const res = await getUnverifiedCount(list.id);
    setModal({ kind: 'delete', list, count: res.ok ? res.data.count : null });
  }

  async function confirmModal() {
    if (!modal) return;
    setBusy(true); setMsg(null);
    const { kind, list } = modal;
    try {
      if (kind === 'archive') {
        const r = await archiveFvList(list.id);
        if (!r.ok) { setMsg({ tone: 'err', text: r.error }); return; }
        setMsg({ tone: 'ok', text: t('rpVerifyAdmin.listsArchived_done') });
      } else if (kind === 'replace') {
        const r = await archiveFvList(list.id);
        if (!r.ok) { setMsg({ tone: 'err', text: r.error }); return; }
        setModal(null); await load(); scrollToUpload();
        setBusy(false); return;
      } else if (kind === 'delete') {
        const r = await deleteUnverifiedFromList(list.id);
        if (!r.ok) { setMsg({ tone: 'err', text: r.error }); return; }
        setMsg({ tone: 'ok', text: t('rpVerifyAdmin.listsDeleted', { n: r.data.deleted }) });
      }
      setModal(null);
      await load();
    } finally { setBusy(false); }
  }

  async function onRestore(list: FvCustomerList) {
    setBusy(true); setMsg(null);
    const r = await restoreFvList(list.id);
    setMsg(r.ok ? { tone: 'ok', text: t('rpVerifyAdmin.listsRestored') } : { tone: 'err', text: r.error });
    if (r.ok) await load();
    setBusy(false);
  }

  const { active, archived } = partitionLists(lists);

  return (
    <section id="fv-lists" className="scroll-mt-20 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Database className="h-4 w-4" />{t('rpVerifyAdmin.listsTitle')}</h3>
        <button onClick={scrollToUpload} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50">
          <Upload className="h-3.5 w-3.5" />{t('rpVerifyAdmin.listsUpload')}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('rpVerifyAdmin.listsHint')}</p>

      {msg && (
        <p className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.tone === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {msg.tone === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{msg.text}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : lists.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{t('rpVerifyAdmin.listsEmpty')}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {active.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('rpVerifyAdmin.listsActive')}</p>
              <div className="space-y-2">
                {active.map((l) => (
                  <ListCard key={l.id} l={l} t={t} fmtDate={fmtDate} busy={busy}
                    actions={
                      <>
                        <CardBtn onClick={() => { setMsg(null); setModal({ kind: 'archive', list: l }); }} disabled={busy} icon={<Archive className="h-3.5 w-3.5" />} label={t('rpVerifyAdmin.listsArchive')} />
                        <CardBtn onClick={() => { setMsg(null); setModal({ kind: 'replace', list: l }); }} disabled={busy} icon={<Repeat className="h-3.5 w-3.5" />} label={t('rpVerifyAdmin.listsReplace')} />
                        <CardBtn onClick={() => void openDelete(l)} disabled={busy} danger icon={<Trash2 className="h-3.5 w-3.5" />} label={t('rpVerifyAdmin.listsDeleteUnverified')} />
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {archived.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('rpVerifyAdmin.listsArchived')}</p>
              <div className="space-y-2">
                {archived.map((l) => (
                  <ListCard key={l.id} l={l} t={t} fmtDate={fmtDate} busy={busy}
                    actions={
                      <>
                        <CardBtn onClick={() => void onRestore(l)} disabled={busy} icon={<RotateCcw className="h-3.5 w-3.5" />} label={t('rpVerifyAdmin.listsRestore')} />
                        <Link href="/field-verification/reports" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50">
                          <BarChart3 className="h-3.5 w-3.5" />{t('rpVerifyAdmin.listsViewHistory')}
                        </Link>
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !busy && setModal(null)}>
          <div className="w-full max-w-md rounded-2xl border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                {modal.kind === 'delete' ? <Trash2 className="h-4 w-4 text-red-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                {t(modal.kind === 'archive' ? 'rpVerifyAdmin.listsArchiveTitle' : modal.kind === 'replace' ? 'rpVerifyAdmin.listsReplaceTitle' : 'rpVerifyAdmin.listsDeleteTitle')}
              </h4>
              <button onClick={() => setModal(null)} disabled={busy} aria-label={t('rpVerifyAdmin.listsCancel')} className="flex h-7 w-7 items-center justify-center rounded-full border"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-xs font-semibold">{modal.list.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {modal.kind === 'archive' && t('rpVerifyAdmin.listsArchiveBody')}
              {modal.kind === 'replace' && t('rpVerifyAdmin.listsReplaceBody')}
              {modal.kind === 'delete' && (
                (modal.count ?? 0) > 0
                  ? t('rpVerifyAdmin.listsDeleteBody', { n: modal.count ?? 0 })
                  : t('rpVerifyAdmin.listsDeleteNone')
              )}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setModal(null)} disabled={busy} className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">{t('rpVerifyAdmin.listsCancel')}</button>
              <button
                onClick={() => void confirmModal()}
                disabled={busy || (modal.kind === 'delete' && (modal.count ?? 0) === 0)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50 ${modal.kind === 'delete' ? 'bg-red-600' : 'bg-primary'}`}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('rpVerifyAdmin.listsConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ListCard({ l, t, fmtDate, busy, actions }: {
  l: FvCustomerList;
  t: (k: string, p?: Record<string, string | number>) => string;
  fmtDate: (iso: string) => string;
  busy: boolean;
  actions: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{l.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('rpVerifyAdmin.listsUploadedOn')}: {fmtDate(l.uploadedAt)}{l.uploadedBy ? ` · ${t('rpVerifyAdmin.listsUploadedBy')}: ${l.uploadedBy}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${l.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
          {t(l.status === 'active' ? 'rpVerifyAdmin.listsStatusActive' : 'rpVerifyAdmin.listsStatusArchived')}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        <Stat label={t('rpVerifyAdmin.listsTotal')} value={l.total} />
        <Stat label={t('rpVerifyAdmin.listsReps')} value={l.assignedReps} />
        <Stat label={t('rpVerifyAdmin.listsPending')} value={l.pending} tone="amber" />
        <Stat label={t('rpVerifyAdmin.listsCompleted')} value={l.completed} tone="green" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'green' }) {
  return (
    <div>
      <span className="block text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : ''}`}>{value}</span>
    </div>
  );
}

function CardBtn({ onClick, disabled, icon, label, danger }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50 ${danger ? 'border-red-300 text-red-700 hover:bg-red-50' : 'hover:bg-muted/50'}`}>
      {icon}{label}
    </button>
  );
}
