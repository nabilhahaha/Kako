'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, Check, AlertTriangle, Plus, Copy, Power, PowerOff, Pencil, BarChart3,
  FileText, Lock, ShieldCheck, X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { listForms, createForm, duplicateForm, setFormActive } from './rp-forms-actions';
import { formName, type FormSummary } from './forms-library';

type Msg = { tone: 'ok' | 'err'; text: string } | null;

/**
 * Forms Library (admin). Lists the company's custom field-work forms with create / duplicate /
 * activate-deactivate, plus a LOCKED "Core form" card for Field Verification that links to its
 * existing Setup screen (never editable here). Builder + reports are linked per-form (PR-3 / PR-6).
 * Company-scoped + field_verification.admin gated by the page; flag-gated by KAKO_FORM_BUILDER.
 */
export function FormsLibraryPanel() {
  const { t, locale } = useI18n();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    const res = await listForms();
    if (res.ok) setForms(res.data);
    else setMsg({ tone: 'err', text: res.error });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function onCreate() {
    if (!nameEn.trim() && !nameAr.trim()) { setMsg({ tone: 'err', text: t('rpForms.nameRequired') }); return; }
    setBusy(true); setMsg(null);
    const res = await createForm({ nameEn: nameEn.trim(), nameAr: nameAr.trim() });
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
    setShowCreate(false); setNameEn(''); setNameAr('');
    // jump straight into the builder for the new form (PR-3)
    window.location.href = `/field-verification/forms/${res.data.id}/edit`;
  }

  async function onDuplicate(f: FormSummary) {
    setBusy(true); setMsg(null);
    const res = await duplicateForm(f.id, t('rpForms.copySuffix'));
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
    setMsg({ tone: 'ok', text: t('rpForms.duplicated') });
    await load();
  }

  async function onToggle(f: FormSummary) {
    setBusy(true); setMsg(null);
    const res = await setFormActive(f.id, !f.isActive);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
    setMsg({ tone: 'ok', text: t(f.isActive ? 'rpForms.deactivated' : 'rpForms.activated') });
    await load();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold"><FileText className="h-5 w-5" />{t('rpForms.libraryTitle')}</h1>
          <p className="text-xs text-muted-foreground">{t('rpForms.librarySubtitle')}</p>
        </div>
        <button onClick={() => { setMsg(null); setShowCreate(true); }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground active:scale-[0.99]">
          <Plus className="h-4 w-4" />{t('rpForms.newForm')}
        </button>
      </div>

      {msg && (
        <p className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.tone === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {msg.tone === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{msg.text}
        </p>
      )}

      {/* Locked core Field Verification form — links to its existing Setup, never editable here. */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                {t('rpForms.coreForm')}
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground"><Lock className="h-3 w-3" />{t('rpForms.locked')}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('rpForms.coreFormDesc')}</p>
            </div>
          </div>
          <Link href="/field-verification/setup" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50">
            {t('rpForms.manageCore')}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : forms.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t('rpForms.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {forms.map((f) => (
            <li key={f.id}>
              <FormCard f={f} name={formName(f, locale === 'ar' ? 'ar' : 'en')} t={t} busy={busy}
                onDuplicate={() => void onDuplicate(f)} onToggle={() => void onToggle(f)} />
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !busy && setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-bold"><Plus className="h-4 w-4" />{t('rpForms.newFormTitle')}</h4>
              <button onClick={() => setShowCreate(false)} disabled={busy} aria-label={t('rpForms.cancel')} className="flex h-7 w-7 items-center justify-center rounded-full border"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold">{t('rpForms.nameEn')}</span>
                <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr"
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold">{t('rpForms.nameAr')}</span>
                <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl"
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none" />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setShowCreate(false)} disabled={busy} className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">{t('rpForms.cancel')}</button>
              <button onClick={() => void onCreate()} disabled={busy}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{busy ? t('rpForms.creating') : t('rpForms.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ f, t }: { f: FormSummary; t: (k: string) => string }) {
  if (f.draftPending) return <Badge tone="amber" label={t('rpForms.draftPending')} />;
  if (f.hasPublished) return <Badge tone="green" label={t('rpForms.statusPublished')} />;
  if (f.latestStatus === 'draft') return <Badge tone="muted" label={t('rpForms.statusDraft')} />;
  return <Badge tone="muted" label={t('rpForms.noVersion')} />;
}

function Badge({ tone, label }: { tone: 'green' | 'amber' | 'muted'; label: string }) {
  const cls = tone === 'green' ? 'bg-emerald-100 text-emerald-700' : tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground';
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>;
}

function FormCard({ f, name, t, busy, onDuplicate, onToggle }: {
  f: FormSummary; name: string; t: (k: string, p?: Record<string, string | number>) => string;
  busy: boolean; onDuplicate: () => void; onToggle: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-card p-3.5 ${f.isActive ? '' : 'opacity-70'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">{name}</p>
            <StatusBadge f={f} t={t} />
            {!f.isActive && <Badge tone="muted" label={t('rpForms.statusInactive')} />}
          </div>
          {f.latestVersion > 0 && <p className="mt-0.5 text-[11px] text-muted-foreground">{t('rpForms.versionLabel', { n: f.latestVersion })}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/field-verification/forms/${f.id}/edit`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50">
          <Pencil className="h-3.5 w-3.5" />{t('rpForms.edit')}
        </Link>
        <button onClick={onDuplicate} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50 disabled:opacity-50">
          <Copy className="h-3.5 w-3.5" />{t('rpForms.duplicate')}
        </button>
        <button onClick={onToggle} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50 disabled:opacity-50">
          {f.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}{t(f.isActive ? 'rpForms.deactivate' : 'rpForms.activate')}
        </button>
        <Link href={`/field-verification/forms/${f.id}/report`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50">
          <BarChart3 className="h-3.5 w-3.5" />{t('rpForms.viewReport')}
        </Link>
      </div>
    </div>
  );
}
