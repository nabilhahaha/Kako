'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, Check, AlertTriangle, Plus, Trash2, ChevronUp, ChevronDown, ChevronLeft,
  Save, Send, Eye, EyeOff, GripVertical, X, Users,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getFormForEdit, saveFormDraft, publishForm } from './rp-forms-actions';
import {
  emptyFormSchema, validateFormSchema, isChoiceField, isPhotoField,
  FORM_FIELD_TYPES, CUSTOMER_LINKS,
  type FormSchema, type FormField, type FormFieldType, type CustomerLink, type FormFieldOption,
} from '@/lib/forms/form-schema';
import { FormPreview } from './form-preview';

type Msg = { tone: 'ok' | 'err'; text: string } | null;

function newField(order: number): FormField {
  return {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `f_${order}_${Date.now()}`,
    type: 'text', labelEn: '', labelAr: '', required: false, visible: true, order,
    help: null, options: [], photoRequired: false, includeInReport: true,
  };
}

/**
 * Generic two-pane form builder. Left = name + settings + field editor (add/edit/reorder/delete);
 * right = live read-only FormPreview. Save Draft / Publish via rp-forms-actions (publish archives
 * the prior published version; submissions resolve historically by version). Definition-only —
 * never writes a response/customer/photo. Company-scoped + admin gated by the page.
 */
export function FormBuilder({ formId }: { formId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [settings, setSettings] = useState<FormSchema['settings']>(emptyFormSchema().settings);
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const res = await getFormForEdit(formId);
      if (res.ok) {
        setNameEn(res.data.nameEn); setNameAr(res.data.nameAr);
        setSettings(res.data.schema.settings);
        setFields(res.data.schema.fields);
        setVersion(res.data.version);
      } else setLoadErr(res.error);
      setLoading(false);
    })();
  }, [formId]);

  const schema: FormSchema = useMemo(() => ({ settings, fields }), [settings, fields]);

  const patchField = useCallback((id: string, patch: Partial<FormField>) => {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);
  const addField = () => {
    setFields((fs) => { const f = newField(fs.length); setSelectedId(f.id); return [...fs, f]; });
  };
  const removeField = (id: string) => {
    setFields((fs) => fs.filter((f) => f.id !== id).map((f, i) => ({ ...f, order: i })));
    setSelectedId((s) => (s === id ? null : s));
  };
  const move = (id: string, dir: -1 | 1) => {
    setFields((fs) => {
      const i = fs.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= fs.length) return fs;
      const next = fs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((f, k) => ({ ...f, order: k }));
    });
  };

  async function onSaveDraft() {
    setSaving(true); setMsg(null);
    const res = await saveFormDraft({ formId, nameEn, nameAr, schema });
    setSaving(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
    setVersion(res.data.version);
    setMsg({ tone: 'ok', text: t('rpFormBuilder.savedDraft') });
  }
  async function onPublish() {
    const errs = validateFormSchema(schema);
    if (errs.length > 0) { setMsg({ tone: 'err', text: t('rpFormBuilder.fixErrors') }); return; }
    setPublishing(true); setMsg(null);
    const res = await publishForm({ formId, nameEn, nameAr, schema });
    setPublishing(false);
    if (!res.ok) { setMsg({ tone: 'err', text: res.error === 'err_invalid_schema' ? t('rpFormBuilder.fixErrors') : res.error }); return; }
    setVersion(res.data.version);
    setMsg({ tone: 'ok', text: t('rpFormBuilder.published') });
  }

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (loadErr) return (
    <div className="mx-auto max-w-md p-4">
      <p className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{t('rpFormBuilder.notFound')}</p>
      <button onClick={() => router.push('/field-verification/forms')} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t('rpFormBuilder.back')}</button>
    </div>
  );

  const errs = validateFormSchema(schema);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => router.push('/field-verification/forms')} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t('rpFormBuilder.back')}
        </button>
        <div className="flex items-center gap-2">
          {version > 0 && <span className="text-[11px] text-muted-foreground">{t('rpFormBuilder.versionLabel', { n: version })}</span>}
          <Link href={`/field-verification/forms/${formId}/assign`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold hover:bg-muted/50">
            <Users className="h-4 w-4" />{t('rpFormBuilder.assign')}
          </Link>
          <button onClick={() => void onSaveDraft()} disabled={saving || publishing}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold hover:bg-muted/50 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t('rpFormBuilder.saveDraft')}
          </button>
          <button onClick={() => void onPublish()} disabled={saving || publishing}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t('rpFormBuilder.publish')}
          </button>
        </div>
      </div>

      {msg && (
        <p className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.tone === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {msg.tone === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{msg.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── left: editor ── */}
        <div className="space-y-4">
          {/* name + settings */}
          <div className="rounded-xl border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold">{t('rpFormBuilder.nameEn')}</span>
                <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold">{t('rpFormBuilder.nameAr')}</span>
                <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none" />
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold">{t('rpFormBuilder.customerLink')}</span>
                <select value={settings.customerLink} onChange={(e) => setSettings((s) => ({ ...s, customerLink: e.target.value as CustomerLink }))}
                  className="h-10 w-full rounded-lg border bg-background px-2 text-sm">
                  {CUSTOMER_LINKS.map((c) => <option key={c} value={c}>{t(`rpFormBuilder.customerLink_${c}`)}</option>)}
                </select>
              </label>
              <div className="space-y-1">
                <span className="text-xs font-semibold">{t('rpFormBuilder.gps')}</span>
                <label className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
                  <input type="checkbox" checked={settings.requireGps} onChange={(e) => setSettings((s) => ({ ...s, requireGps: e.target.checked }))} />
                  {t('rpFormBuilder.requireGps')}
                </label>
              </div>
            </div>
          </div>

          {/* fields */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{t('rpFormBuilder.fieldsTitle')}</h3>
              <button onClick={addField} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"><Plus className="h-3.5 w-3.5" />{t('rpFormBuilder.addField')}</button>
            </div>
            {fields.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{t('rpFormBuilder.noFields')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {fields.map((f, i) => (
                  <FieldRow key={f.id} f={f} t={t} locale={locale === 'ar' ? 'ar' : 'en'}
                    selected={selectedId === f.id} first={i === 0} last={i === fields.length - 1}
                    onSelect={() => setSelectedId(selectedId === f.id ? null : f.id)}
                    onPatch={(p) => patchField(f.id, p)} onRemove={() => removeField(f.id)}
                    onUp={() => move(f.id, -1)} onDown={() => move(f.id, 1)} />
                ))}
              </ul>
            )}
            {errs.length > 0 && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{t('rpFormBuilder.publishHint')}</p>
            )}
          </div>
        </div>

        {/* ── right: preview (sticky on desktop) ── */}
        <div className="lg:sticky lg:top-4 lg:self-start"><FormPreview schema={schema} /></div>
      </div>
    </div>
  );
}

function FieldRow({ f, t, locale, selected, first, last, onSelect, onPatch, onRemove, onUp, onDown }: {
  f: FormField; t: (k: string, p?: Record<string, string | number>) => string; locale: 'ar' | 'en';
  selected: boolean; first: boolean; last: boolean;
  onSelect: () => void; onPatch: (p: Partial<FormField>) => void; onRemove: () => void; onUp: () => void; onDown: () => void;
}) {
  const title = (locale === 'ar' ? f.labelAr : f.labelEn) || (locale === 'ar' ? f.labelEn : f.labelAr) || t('rpFormBuilder.untitledField');
  return (
    <li className="rounded-lg border">
      <div className="flex items-center gap-2 p-2">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        <button onClick={onSelect} className="min-w-0 flex-1 text-start">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="text-[11px] text-muted-foreground">{t(`rpFormBuilder.type_${f.type}`)}{f.required ? ` · ${t('rpFormBuilder.required')}` : ''}{!f.visible ? ` · ${t('rpFormBuilder.hidden')}` : ''}</span>
        </button>
        <button onClick={() => onPatch({ visible: !f.visible })} aria-label={t('rpFormBuilder.visible')} className="rounded p-1 text-muted-foreground hover:bg-muted">{f.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
        <button onClick={onUp} disabled={first} aria-label={t('rpFormBuilder.moveUp')} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
        <button onClick={onDown} disabled={last} aria-label={t('rpFormBuilder.moveDown')} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
        <button onClick={onRemove} aria-label={t('rpFormBuilder.removeField')} className="rounded p-1 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
      </div>

      {selected && (
        <div className="space-y-3 border-t bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold">{t('rpFormBuilder.fieldType')}</span>
              <select value={f.type} onChange={(e) => onPatch({ type: e.target.value as FormFieldType })} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
                {FORM_FIELD_TYPES.map((ty) => <option key={ty} value={ty}>{t(`rpFormBuilder.type_${ty}`)}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={f.required} onChange={(e) => onPatch({ required: e.target.checked })} />{t('rpFormBuilder.required')}</label>
              <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={f.includeInReport} onChange={(e) => onPatch({ includeInReport: e.target.checked })} />{t('rpFormBuilder.includeInReport')}</label>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold">{t('rpFormBuilder.labelEn')}</span>
              <input value={f.labelEn} onChange={(e) => onPatch({ labelEn: e.target.value })} dir="ltr" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold">{t('rpFormBuilder.labelAr')}</span>
              <input value={f.labelAr} onChange={(e) => onPatch({ labelAr: e.target.value })} dir="rtl" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold">{t('rpFormBuilder.help')}</span>
            <input value={f.help ?? ''} onChange={(e) => onPatch({ help: e.target.value || null })} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
          </label>

          {isPhotoField(f.type) && (
            <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={f.photoRequired} onChange={(e) => onPatch({ photoRequired: e.target.checked })} />{t('rpFormBuilder.photoRequired')}</label>
          )}

          {isChoiceField(f.type) && (
            <OptionsEditor f={f} t={t} onPatch={onPatch} />
          )}
        </div>
      )}
    </li>
  );
}

function OptionsEditor({ f, t, onPatch }: { f: FormField; t: (k: string) => string; onPatch: (p: Partial<FormField>) => void }) {
  const set = (opts: FormFieldOption[]) => onPatch({ options: opts });
  const add = () => set([...f.options, { value: `opt${f.options.length + 1}`, labelEn: '', labelAr: '' }]);
  const patch = (i: number, p: Partial<FormFieldOption>) => set(f.options.map((o, k) => (k === i ? { ...o, ...p } : o)));
  const remove = (i: number) => set(f.options.filter((_, k) => k !== i));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">{t('rpFormBuilder.options')}</span>
        <button onClick={add} className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold hover:bg-muted/50"><Plus className="h-3 w-3" />{t('rpFormBuilder.addOption')}</button>
      </div>
      {f.options.length === 0 ? (
        <p className="rounded border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground">{t('rpFormBuilder.optionsEmpty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {f.options.map((o, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <input value={o.labelEn} onChange={(e) => patch(i, { labelEn: e.target.value })} placeholder={t('rpFormBuilder.optionLabelEn')} dir="ltr" className="h-8 w-full rounded border bg-background px-2 text-xs" />
              <input value={o.labelAr} onChange={(e) => patch(i, { labelAr: e.target.value })} placeholder={t('rpFormBuilder.optionLabelAr')} dir="rtl" className="h-8 w-full rounded border bg-background px-2 text-xs" />
              <button onClick={() => remove(i)} aria-label={t('rpFormBuilder.removeOption')} className="rounded p-1 text-red-600 hover:bg-red-50"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
