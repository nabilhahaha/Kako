'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, AlertTriangle, Plus, X, ChevronLeft, Users, Store } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import {
  listFormAssignments, addFormAssignment, removeFormAssignment, getAssignmentFacets,
  type FormAssignmentRow, type AssignmentFacets,
} from './rp-form-assignments-actions';
import { isUserScopeTarget, type AssignmentTargetType } from '@/lib/forms/form-assignments';

type Msg = { tone: 'ok' | 'err'; text: string } | null;

/** Target types offered in the picker (department is part of the model but not surfaced). */
const USER_TYPES: AssignmentTargetType[] = ['user', 'role', 'supervisor', 'team', 'branch'];
const CUSTOMER_TYPES: AssignmentTargetType[] = ['dataset', 'city', 'channel'];
const ALL_TYPES = [...USER_TYPES, ...CUSTOMER_TYPES];

/**
 * Form assignment (admin). Add/remove who can use a form (user/role/supervisor/team/branch) and
 * which customers it applies to (dataset/city/channel). Writes erp_form_assignments via
 * rp-form-assignments-actions; company-scoped + admin gated. Shows a friendly notice if the
 * 0379 table isn't applied yet (err_assignments_pending_migration).
 */
export function FormAssignmentsPanel({ formId }: { formId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<FormAssignmentRow[]>([]);
  const [facets, setFacets] = useState<AssignmentFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [type, setType] = useState<AssignmentTargetType>('user');
  const [value, setValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    const [a, f] = await Promise.all([listFormAssignments(formId), getAssignmentFacets()]);
    if (a.ok) { setRows(a.data); setPending(false); }
    else if (a.error === 'err_assignments_pending_migration') { setPending(true); setRows([]); }
    else setMsg({ tone: 'err', text: a.error });
    if (f.ok) setFacets(f.data);
    setLoading(false);
  }, [formId]);
  useEffect(() => { void load(); }, [load]);

  // Options for the value picker, by current target type.
  const options = useMemo<{ value: string; label: string }[]>(() => {
    if (!facets) return [];
    switch (type) {
      case 'user':
      case 'supervisor': return facets.users.map((u) => ({ value: u.id, label: u.email ? `${u.name} · ${u.email}` : u.name }));
      case 'role': return facets.roles.map((r) => ({ value: r, label: t(`rpFormAssign.role_${r}`) }));
      case 'team': return facets.teams.map((x) => ({ value: x.id, label: x.name }));
      case 'branch': return facets.branches.map((x) => ({ value: x.id, label: x.name }));
      case 'dataset': return facets.datasets.map((x) => ({ value: x.id, label: x.name }));
      case 'city': return facets.cities.map((c) => ({ value: c, label: c }));
      case 'channel': return facets.channels.map((c) => ({ value: c, label: c }));
      default: return [];
    }
  }, [facets, type, t]);

  // city/channel allow free text when the catalog has no entries.
  const freeText = (type === 'city' || type === 'channel') && options.length === 0;

  // Resolve a stored assignment to a human label using the facets.
  const labelFor = useCallback((r: FormAssignmentRow): string => {
    if (!facets) return r.targetValue;
    switch (r.targetType) {
      case 'user':
      case 'supervisor': return facets.users.find((u) => u.id === r.targetValue)?.name ?? r.targetValue;
      case 'role': return t(`rpFormAssign.role_${r.targetValue}`);
      case 'team': return facets.teams.find((x) => x.id === r.targetValue)?.name ?? r.targetValue;
      case 'branch': return facets.branches.find((x) => x.id === r.targetValue)?.name ?? r.targetValue;
      case 'dataset': return facets.datasets.find((x) => x.id === r.targetValue)?.name ?? r.targetValue;
      default: return r.targetValue;
    }
  }, [facets, t]);

  function changeType(next: AssignmentTargetType) { setType(next); setValue(''); }

  async function onAdd() {
    if (!value.trim()) { setMsg({ tone: 'err', text: t('rpFormAssign.chooseValue') }); return; }
    setBusy(true); setMsg(null);
    const res = await addFormAssignment(formId, type, value.trim());
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error === 'err_assignments_pending_migration' ? t('rpFormAssign.pendingMigration') : res.error }); return; }
    setValue(''); setMsg({ tone: 'ok', text: t('rpFormAssign.added') });
    await load();
  }
  async function onRemove(id: string) {
    setBusy(true); setMsg(null);
    const res = await removeFormAssignment(id);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
    setMsg({ tone: 'ok', text: t('rpFormAssign.removed') });
    await load();
  }

  const userRows = rows.filter((r) => isUserScopeTarget(r.targetType));
  const custRows = rows.filter((r) => !isUserScopeTarget(r.targetType));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => router.push(`/field-verification/forms/${formId}/edit`)} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t('rpFormAssign.back')}
        </button>
      </div>
      <div>
        <h1 className="text-lg font-extrabold">{t('rpFormAssign.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('rpFormAssign.subtitle')}</p>
      </div>

      {msg && (
        <p className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.tone === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {msg.tone === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{msg.text}
        </p>
      )}

      {pending && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />{t('rpFormAssign.pendingMigration')}
        </p>
      )}

      {/* add target */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-bold">{t('rpFormAssign.addTarget')}</h3>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold">{t('rpFormAssign.targetType')}</span>
            <select value={type} onChange={(e) => changeType(e.target.value as AssignmentTargetType)} className="h-9 rounded-lg border bg-background px-2 text-sm">
              <optgroup label={t('rpFormAssign.whoTitle')}>
                {USER_TYPES.map((ty) => <option key={ty} value={ty}>{t(`rpFormAssign.type_${ty}`)}</option>)}
              </optgroup>
              <optgroup label={t('rpFormAssign.customersTitle')}>
                {CUSTOMER_TYPES.map((ty) => <option key={ty} value={ty}>{t(`rpFormAssign.type_${ty}`)}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="min-w-[12rem] flex-1 space-y-1">
            <span className="block text-[11px] font-semibold">{t('rpFormAssign.value')}</span>
            {freeText ? (
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('rpFormAssign.value')} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
            ) : (
              <select value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
                <option value="">{t('rpFormAssign.choose')}</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </label>
          <button onClick={() => void onAdd()} disabled={busy || !value.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
            <Plus className="h-4 w-4" />{t('rpFormAssign.add')}
          </button>
        </div>
        {!freeText && options.length === 0 && facets && (
          <p className="mt-2 text-[11px] text-muted-foreground">{t('rpFormAssign.noOptions')}</p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <AssignGroup title={t('rpFormAssign.whoTitle')} hint={t('rpFormAssign.whoHint')} icon={<Users className="h-4 w-4" />}
            rows={userRows} empty={t('rpFormAssign.whoEmpty')} t={t} labelFor={labelFor} onRemove={onRemove} busy={busy} />
          <AssignGroup title={t('rpFormAssign.customersTitle')} hint={t('rpFormAssign.customersHint')} icon={<Store className="h-4 w-4" />}
            rows={custRows} empty={t('rpFormAssign.customersEmpty')} t={t} labelFor={labelFor} onRemove={onRemove} busy={busy} />
        </div>
      )}
      <div aria-hidden className="sr-only">{locale}</div>
    </div>
  );
}

function AssignGroup({ title, hint, icon, rows, empty, t, labelFor, onRemove, busy }: {
  title: string; hint: string; icon: React.ReactNode; rows: FormAssignmentRow[]; empty: string;
  t: (k: string) => string; labelFor: (r: FormAssignmentRow) => string; onRemove: (id: string) => void; busy: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold">{icon}{title}</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {rows.map((r) => (
            <li key={r.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 py-1 pe-1 ps-2.5 text-xs">
              <span className="font-semibold text-muted-foreground">{t(`rpFormAssign.type_${r.targetType}`)}:</span>
              <span className="font-semibold">{labelFor(r)}</span>
              <button onClick={() => onRemove(r.id)} disabled={busy} aria-label={t('rpFormAssign.remove')} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
