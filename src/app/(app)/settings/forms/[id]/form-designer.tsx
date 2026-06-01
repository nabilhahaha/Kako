'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Save, Trash2, ChevronUp, ChevronDown, Loader2, Pencil } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { FIELD_TYPES, type FieldType, type FormEffect, type FormEffectType, type SubjectRef } from '@/lib/erp/form-builder';
import type { Condition, ConditionOp, Validation } from '@/lib/erp/form-rules';
import { FormPreview, type PreviewField } from './form-preview';
import { updateForm, upsertField, deleteField, reorderFields } from './actions';

export interface DbForm {
  id: string; company_id: string | null; key: string; name_ar: string | null; name_en: string | null;
  module: string | null; target_entity: string | null; workflow_key: string | null; status: 'draft' | 'active' | 'archived'; version: number;
  effect: FormEffect | null;
  subject_ref: SubjectRef | null;
}
export interface DbField {
  id: string; key: string; label_ar: string | null; label_en: string | null; help_ar: string | null; help_en: string | null;
  type: FieldType; section: string | null; sort_order: number; required: boolean; options: unknown | null; default_value: string | null;
  visibility: unknown | null; validation: unknown | null;
}
export interface WorkflowOpt { key: string; name_ar: string | null; name_en: string | null }

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const OPTION_TYPES: FieldType[] = ['dropdown', 'multiselect'];
const COND_OPS: ConditionOp[] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'exists'];

// ── Whitelisted effects (B6). Mirrors the server allowlists in form-effects.ts;
//    the server re-validates, so these are just UI hints. ──
const EFFECT_TYPES: FormEffectType[] = ['record_only', 'update_field', 'set_gps', 'create_customer'];
const EFFECT_TABLES = ['erp_customers'];
const UPDATE_COLUMNS: Record<string, string[]> = { erp_customers: ['name', 'name_ar', 'phone', 'email', 'address', 'city', 'tax_number', 'latitude', 'longitude'] };
const CUSTOMER_MAP_COLUMNS = ['name', 'name_ar', 'phone', 'email', 'address', 'city', 'tax_number'];

function parseOptions(raw: unknown): { value: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is { value: string; label: string } => !!o && typeof o === 'object' && 'value' in o);
}
function toPreview(f: DbField): PreviewField {
  return { key: f.key, type: f.type, labelAr: f.label_ar, labelEn: f.label_en, helpAr: f.help_ar, helpEn: f.help_en,
    section: f.section, required: f.required, options: parseOptions(f.options), defaultValue: f.default_value,
    visibility: (f.visibility as Condition | null) ?? null, validation: (f.validation as Validation | null) ?? null };
}

interface EditState {
  id?: string; key: string; type: FieldType; labelEn: string; labelAr: string; helpEn: string; helpAr: string;
  section: string; required: boolean; optionsText: string; defaultValue: string;
  visWhen: string; visOp: ConditionOp; visValue: string;
  reqWhen: string; reqOp: ConditionOp; reqValue: string;
  vMin: string; vMax: string; vMinLen: string; vMaxLen: string; vRegex: string;
}
const blankEdit = (): EditState => ({
  key: '', type: 'text', labelEn: '', labelAr: '', helpEn: '', helpAr: '', section: '', required: false, optionsText: '', defaultValue: '',
  visWhen: '', visOp: 'eq', visValue: '', reqWhen: '', reqOp: 'eq', reqValue: '', vMin: '', vMax: '', vMinLen: '', vMaxLen: '', vRegex: '',
});
function editFrom(f: DbField): EditState {
  const vis = (f.visibility as Condition | null) ?? null;
  const val = (f.validation as Validation | null) ?? null;
  const rw = val?.requiredWhen ?? null;
  const num = (n: number | undefined) => (n != null ? String(n) : '');
  return {
    id: f.id, key: f.key, type: f.type, labelEn: f.label_en ?? '', labelAr: f.label_ar ?? '', helpEn: f.help_en ?? '', helpAr: f.help_ar ?? '',
    section: f.section ?? '', required: f.required, defaultValue: f.default_value ?? '',
    optionsText: parseOptions(f.options).map((o) => `${o.value}|${o.label}`).join('\n'),
    visWhen: vis?.when ?? '', visOp: vis?.op ?? 'eq', visValue: vis?.value != null ? String(vis.value) : '',
    reqWhen: rw?.when ?? '', reqOp: rw?.op ?? 'eq', reqValue: rw?.value != null ? String(rw.value) : '',
    vMin: num(val?.min), vMax: num(val?.max), vMinLen: num(val?.minLen), vMaxLen: num(val?.maxLen), vRegex: val?.regex ?? '',
  };
}

export function FormDesigner({ form, fields, workflows, readOnly }: { form: DbForm; fields: DbField[]; workflows: WorkflowOpt[]; readOnly: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<EditState | null>(null);

  // ── form header ──
  const [hdr, setHdr] = useState({
    nameEn: form.name_en ?? '', nameAr: form.name_ar ?? '', module: form.module ?? '',
    targetEntity: form.target_entity ?? '', workflowKey: form.workflow_key ?? '', status: form.status,
  });

  // ── effect (B6) ──
  const [eff, setEff] = useState<FormEffect>(() => (form.effect && form.effect.type ? form.effect : { type: 'record_only' }));
  // ── subject source (generic owner resolution) ──
  const [subj, setSubj] = useState<SubjectRef | null>(() => form.subject_ref ?? null);
  const subjSource: 'none' | 'record' | 'field' = subj?.source ?? 'none';
  const fieldKeyOpts = fields.filter((f) => f.type !== 'section').map((f) => f.key);
  const gpsFieldOpts = fields.filter((f) => f.type === 'gps').map((f) => f.key);
  const patchMap = (col: string, key: string) => {
    const map = { ...(eff.map ?? {}) };
    if (key) map[col] = key; else delete map[col];
    setEff({ ...eff, map });
  };

  function saveHeader() {
    start(async () => {
      const res = await updateForm({ id: form.id, ...hdr, effect: eff, subjectRef: subj });
      if (!res.ok) { toast.error(res.error ?? t('forms.toast.error')); return; }
      toast.success(t('forms.toast.saved'));
      router.refresh();
    });
  }

  function saveField() {
    if (!edit) return;
    const options = OPTION_TYPES.includes(edit.type)
      ? edit.optionsText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [v, ...rest] = l.split('|'); return { value: v.trim(), label: (rest.join('|') || v).trim() }; })
      : undefined;
    const visibility: Condition | null = edit.visWhen.trim() ? { when: edit.visWhen.trim(), op: edit.visOp, value: edit.visValue } : null;
    const validation: Validation = {};
    if (edit.reqWhen.trim()) validation.requiredWhen = { when: edit.reqWhen.trim(), op: edit.reqOp, value: edit.reqValue };
    if (edit.vMin !== '') validation.min = Number(edit.vMin);
    if (edit.vMax !== '') validation.max = Number(edit.vMax);
    if (edit.vMinLen !== '') validation.minLen = Number(edit.vMinLen);
    if (edit.vMaxLen !== '') validation.maxLen = Number(edit.vMaxLen);
    if (edit.vRegex.trim()) validation.regex = edit.vRegex.trim();
    start(async () => {
      const res = await upsertField({
        formId: form.id, id: edit.id, key: edit.key, type: edit.type, labelEn: edit.labelEn, labelAr: edit.labelAr,
        helpEn: edit.helpEn, helpAr: edit.helpAr, section: edit.section, required: edit.required, options, defaultValue: edit.defaultValue,
        visibility, validation: Object.keys(validation).length ? validation : null,
      });
      if (!res.ok) { toast.error(res.error ?? t('forms.toast.error')); return; }
      toast.success(t('forms.toast.saved'));
      setEdit(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => { const res = await deleteField(form.id, id); if (!res.ok) toast.error(res.error ?? t('forms.toast.error')); else router.refresh(); });
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...fields];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    start(async () => { const res = await reorderFields(form.id, next.map((f) => f.id)); if (!res.ok) toast.error(res.error ?? t('forms.toast.error')); else router.refresh(); });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Builder ── */}
      <div className="space-y-4">
        {/* Header / workflow binding */}
        <Card><CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">{t('forms.formSettings')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>{t('forms.nameEn')}</Label><Input value={hdr.nameEn} disabled={readOnly} onChange={(e) => setHdr({ ...hdr, nameEn: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('forms.nameAr')}</Label><Input value={hdr.nameAr} disabled={readOnly} onChange={(e) => setHdr({ ...hdr, nameAr: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('forms.module')}</Label><Input value={hdr.module} dir="ltr" disabled={readOnly} onChange={(e) => setHdr({ ...hdr, module: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('forms.targetEntity')}</Label><Input value={hdr.targetEntity} dir="ltr" disabled={readOnly} onChange={(e) => setHdr({ ...hdr, targetEntity: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('forms.workflow')}</Label>
              <select className={selectCls} value={hdr.workflowKey} disabled={readOnly} onChange={(e) => setHdr({ ...hdr, workflowKey: e.target.value })}>
                <option value="">{t('forms.noWorkflow')}</option>
                {workflows.map((w) => <option key={w.key} value={w.key}>{(w.name_en || w.name_ar) ?? w.key}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>{t('forms.statusLabel')}</Label>
              <select className={selectCls} value={hdr.status} disabled={readOnly} onChange={(e) => setHdr({ ...hdr, status: e.target.value as DbForm['status'] })}>
                {['draft', 'active', 'archived'].map((s) => <option key={s} value={s}>{t(`forms.status.${s}`)}</option>)}
              </select>
            </div>
          </div>

          {/* ── Effect on approval (B6) ── */}
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">{t('forms.effect.title')}</p>
              <p className="text-xs text-muted-foreground">{t('forms.effect.hint')}</p>
            </div>
            <div className="space-y-1">
              <Label>{t('forms.effect.type')}</Label>
              <select className={selectCls} value={eff.type} disabled={readOnly} onChange={(e) => setEff({ type: e.target.value as FormEffectType })}>
                {EFFECT_TYPES.map((et) => <option key={et} value={et}>{t(`forms.effect.types.${et}`)}</option>)}
              </select>
            </div>

            {eff.type === 'update_field' && (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1"><Label>{t('forms.effect.table')}</Label>
                  <select className={selectCls} value={eff.table ?? ''} disabled={readOnly} onChange={(e) => setEff({ ...eff, table: e.target.value, column: '' })}>
                    <option value="">{t('forms.preview.choose')}</option>
                    {EFFECT_TABLES.map((tb) => <option key={tb} value={tb}>{tb}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>{t('forms.effect.column')}</Label>
                  <select className={selectCls} value={eff.column ?? ''} disabled={readOnly || !eff.table} onChange={(e) => setEff({ ...eff, column: e.target.value })}>
                    <option value="">{t('forms.preview.choose')}</option>
                    {(UPDATE_COLUMNS[eff.table ?? ''] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>{t('forms.effect.valueFrom')}</Label>
                  <select className={selectCls} value={eff.value_from ?? ''} disabled={readOnly} onChange={(e) => setEff({ ...eff, value_from: e.target.value })}>
                    <option value="">{t('forms.preview.choose')}</option>
                    {fieldKeyOpts.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
            )}

            {eff.type === 'set_gps' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('forms.effect.table')}</Label>
                  <select className={selectCls} value={eff.table ?? ''} disabled={readOnly} onChange={(e) => setEff({ ...eff, table: e.target.value })}>
                    <option value="">{t('forms.preview.choose')}</option>
                    {EFFECT_TABLES.map((tb) => <option key={tb} value={tb}>{tb}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>{t('forms.effect.gpsField')}</Label>
                  <select className={selectCls} value={eff.value_from ?? ''} disabled={readOnly} onChange={(e) => setEff({ ...eff, value_from: e.target.value })}>
                    <option value="">{t('forms.preview.choose')}</option>
                    {(gpsFieldOpts.length ? gpsFieldOpts : fieldKeyOpts).map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
            )}

            {eff.type === 'create_customer' && (
              <div className="space-y-2">
                <Label>{t('forms.effect.mapping')}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CUSTOMER_MAP_COLUMNS.map((col) => (
                    <div key={col} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 font-mono text-xs" dir="ltr">{col}{col === 'name' && <span className="text-destructive"> *</span>}</span>
                      <select className={selectCls} value={(eff.map ?? {})[col] ?? ''} disabled={readOnly} onChange={(e) => patchMap(col, e.target.value)}>
                        <option value="">{t('forms.effect.unmapped')}</option>
                        {fieldKeyOpts.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Subject customer (generic owner resolution) ── */}
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">{t('forms.subject.title')}</p>
              <p className="text-xs text-muted-foreground">{t('forms.subject.hint')}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label>{t('forms.subject.source')}</Label>
                <select className={selectCls} value={subjSource} disabled={readOnly}
                  onChange={(e) => {
                    const s = e.target.value as 'none' | 'record' | 'field';
                    setSubj(s === 'none' ? null : s === 'record' ? { entity: 'customer', source: 'record' } : { entity: 'customer', source: 'field', key: subj?.key });
                  }}>
                  <option value="none">{t('forms.subject.none')}</option>
                  <option value="record">{t('forms.subject.record')}</option>
                  <option value="field">{t('forms.subject.field')}</option>
                </select>
              </div>
              {subjSource === 'field' && (
                <div className="space-y-1"><Label>{t('forms.subject.fieldKey')}</Label>
                  <select className={selectCls} value={subj?.key ?? ''} disabled={readOnly} onChange={(e) => setSubj({ entity: 'customer', source: 'field', key: e.target.value })}>
                    <option value="">{t('forms.preview.choose')}</option>
                    {fieldKeyOpts.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {!readOnly && <Button size="sm" disabled={pending} onClick={saveHeader}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('forms.saveSettings')}</Button>}
        </CardContent></Card>

        {/* Fields */}
        <Card><CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('forms.fields')}</h3>
            {!readOnly && !edit && <Button size="sm" onClick={() => setEdit(blankEdit())}><Plus className="h-4 w-4" /> {t('forms.addField')}</Button>}
          </div>

          <div className="divide-y rounded-md border">
            {fields.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t('forms.noFields')}</p>}
            {fields.map((f, i) => (
              <div key={f.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{f.label_en || f.key}</span>{' '}
                  <Badge variant="secondary">{t(`forms.type.${f.type}`)}</Badge>
                  {f.required && <span className="ms-1 text-destructive">*</span>}
                  {f.section && <span className="ms-2 text-xs text-muted-foreground">§ {f.section}</span>}
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => move(i, -1)}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => move(i, 1)}><ChevronDown className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEdit(editFrom(f))}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(f.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {edit && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('forms.fieldKey')}</Label><Input value={edit.key} dir="ltr" onChange={(e) => setEdit({ ...edit, key: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('forms.fieldType')}</Label>
                  <select className={selectCls} value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t(`forms.type.${ft}`)}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>{t('forms.labelEn')}</Label><Input value={edit.labelEn} onChange={(e) => setEdit({ ...edit, labelEn: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('forms.labelAr')}</Label><Input value={edit.labelAr} onChange={(e) => setEdit({ ...edit, labelAr: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('forms.helpEn')}</Label><Input value={edit.helpEn} onChange={(e) => setEdit({ ...edit, helpEn: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('forms.helpAr')}</Label><Input value={edit.helpAr} onChange={(e) => setEdit({ ...edit, helpAr: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('forms.section')}</Label><Input value={edit.section} onChange={(e) => setEdit({ ...edit, section: e.target.value })} /></div>
                <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={edit.required} onChange={(e) => setEdit({ ...edit, required: e.target.checked })} /> {t('forms.required')}</label>
              </div>
              {OPTION_TYPES.includes(edit.type) && (
                <div className="space-y-1">
                  <Label>{t('forms.options')}</Label>
                  <textarea className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm" dir="ltr" placeholder={'value|Label'} value={edit.optionsText} onChange={(e) => setEdit({ ...edit, optionsText: e.target.value })} />
                  <p className="text-xs text-muted-foreground">{t('forms.optionsHint')}</p>
                </div>
              )}

              {edit.type !== 'section' && (
                <div className="space-y-3 rounded-md border bg-background p-3">
                  <p className="text-sm font-medium">{t('forms.rules.title')}</p>
                  <div className="space-y-1">
                    <Label>{t('forms.rules.showWhen')}</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input dir="ltr" placeholder={t('forms.rules.fieldKey')} value={edit.visWhen} onChange={(e) => setEdit({ ...edit, visWhen: e.target.value })} />
                      <select className={selectCls} value={edit.visOp} onChange={(e) => setEdit({ ...edit, visOp: e.target.value as ConditionOp })}>{COND_OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                      <Input dir="ltr" placeholder={t('forms.rules.value')} value={edit.visValue} onChange={(e) => setEdit({ ...edit, visValue: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('forms.rules.requiredWhen')}</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input dir="ltr" placeholder={t('forms.rules.fieldKey')} value={edit.reqWhen} onChange={(e) => setEdit({ ...edit, reqWhen: e.target.value })} />
                      <select className={selectCls} value={edit.reqOp} onChange={(e) => setEdit({ ...edit, reqOp: e.target.value as ConditionOp })}>{COND_OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                      <Input dir="ltr" placeholder={t('forms.rules.value')} value={edit.reqValue} onChange={(e) => setEdit({ ...edit, reqValue: e.target.value })} />
                    </div>
                  </div>
                  {edit.type === 'number' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1"><Label>{t('forms.validation.min')}</Label><Input type="number" dir="ltr" value={edit.vMin} onChange={(e) => setEdit({ ...edit, vMin: e.target.value })} /></div>
                      <div className="space-y-1"><Label>{t('forms.validation.max')}</Label><Input type="number" dir="ltr" value={edit.vMax} onChange={(e) => setEdit({ ...edit, vMax: e.target.value })} /></div>
                    </div>
                  )}
                  {edit.type === 'text' && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1"><Label>{t('forms.validation.minLen')}</Label><Input type="number" dir="ltr" value={edit.vMinLen} onChange={(e) => setEdit({ ...edit, vMinLen: e.target.value })} /></div>
                      <div className="space-y-1"><Label>{t('forms.validation.maxLen')}</Label><Input type="number" dir="ltr" value={edit.vMaxLen} onChange={(e) => setEdit({ ...edit, vMaxLen: e.target.value })} /></div>
                      <div className="space-y-1"><Label>{t('forms.validation.regex')}</Label><Input dir="ltr" value={edit.vRegex} onChange={(e) => setEdit({ ...edit, vRegex: e.target.value })} /></div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={saveField}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('forms.saveField')}</Button>
                <Button size="sm" variant="outline" onClick={() => setEdit(null)}>{t('forms.cancel')}</Button>
              </div>
            </div>
          )}
        </CardContent></Card>
      </div>

      {/* ── Live preview ── */}
      <div className="space-y-2">
        <h3 className="font-semibold">{t('forms.preview.title')}</h3>
        <Card><CardContent className="pt-6"><FormPreview fields={fields.map(toPreview)} /></CardContent></Card>
      </div>
    </div>
  );
}
