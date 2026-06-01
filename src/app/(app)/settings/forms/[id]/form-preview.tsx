'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { computeVisibility, validateSubmission, isRequired, type Condition, type Validation, type RuleField } from '@/lib/erp/form-rules';
import type { FieldType } from '@/lib/erp/form-builder';

export interface PreviewField {
  key: string; type: FieldType;
  labelAr: string | null; labelEn: string | null; helpAr: string | null; helpEn: string | null;
  section: string | null; required: boolean; options: { value: string; label: string }[] | null; defaultValue: string | null;
  visibility: Condition | null; validation: Validation | null;
}

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/** Interactive Live Preview — fills, applies conditional visibility / required /
 *  validation live via the shared rules engine. Also the basis for the real
 *  submission renderer (B5). */
export function FormPreview({ fields }: { fields: PreviewField[] }) {
  const { t, locale } = useI18n();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.filter((f) => f.type !== 'section' && f.defaultValue != null).map((f) => [f.key, f.defaultValue])),
  );
  const lab = (f: PreviewField) => (locale === 'ar' ? f.labelAr || f.labelEn : f.labelEn || f.labelAr) || f.key;
  const help = (f: PreviewField) => (locale === 'ar' ? f.helpAr || f.helpEn : f.helpEn || f.helpAr);

  const ruleFields: RuleField[] = fields.map((f) => ({ key: f.key, type: f.type, required: f.required, options: f.options, visibility: f.visibility, validation: f.validation }));
  const visible = computeVisibility(ruleFields, values);
  const errors = validateSubmission(ruleFields, values);
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  if (fields.length === 0) return <p className="text-sm text-muted-foreground">{t('forms.preview.empty')}</p>;

  return (
    <div className="space-y-4">
      {fields.map((f, i) => {
        if (!visible[f.key]) return null;
        if (f.type === 'section') return <h4 key={f.key} className="border-b pb-1 pt-2 font-semibold">{lab(f)}</h4>;
        const req = isRequired(ruleFields[i], values);
        const err = errors[f.key];
        return (
          <div key={f.key} className="space-y-1">
            <label className="text-sm font-medium">{lab(f)}{req && <span className="text-destructive"> *</span>}</label>
            <FieldInput f={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
            {help(f) && <p className="text-xs text-muted-foreground">{help(f)}</p>}
            {err && <p className="text-xs text-destructive">{t(`forms.err.${err}`)}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function FieldInput({ f, value, onChange }: { f: PreviewField; value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useI18n();
  const sval = typeof value === 'string' ? value : '';
  switch (f.type) {
    case 'text': return <Input value={sval} onChange={(e) => onChange(e.target.value)} />;
    case 'number': return <Input type="number" dir="ltr" value={sval} onChange={(e) => onChange(e.target.value)} />;
    case 'date': return <Input type="date" dir="ltr" value={sval} onChange={(e) => onChange(e.target.value)} />;
    case 'dropdown':
    case 'entity_ref':
      return (
        <select className={selectCls} value={sval} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('forms.preview.choose')}</option>
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1">
          {(f.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={arr.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} /> {o.label}
            </label>
          ))}
        </div>
      );
    }
    case 'attachment': case 'image':
      return <Input type="file" onChange={(e) => onChange(e.target.files?.[0]?.name ?? '')} />;
    case 'gps': {
      const [lat = '', lng = ''] = sval.split(',');
      const upd = (la: string, ln: string) => onChange(la || ln ? `${la},${ln}` : '');
      return (
        <div className="flex gap-2">
          <Input placeholder="lat" dir="ltr" value={lat} onChange={(e) => upd(e.target.value, lng)} />
          <Input placeholder="lng" dir="ltr" value={lng} onChange={(e) => upd(lat, e.target.value)} />
        </div>
      );
    }
    case 'signature':
      return value
        ? <div className="flex h-20 items-center justify-center rounded-md border bg-secondary text-xs">{t('forms.preview.signed')}</div>
        : <Button type="button" variant="outline" size="sm" onClick={() => onChange('signed')}>{t('forms.preview.sign')}</Button>;
    default: return <Input disabled />;
  }
}
