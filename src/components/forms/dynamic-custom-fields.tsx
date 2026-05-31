'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { isFieldVisible, type CustomFieldDef } from '@/lib/erp/custom-fields';

/** ── Dynamic Forms renderer (custom fields) ────────────────────────────────
 *  Generic, entity-agnostic: renders a company's active custom fields from
 *  their definitions, tracks values, evaluates visibility live, and emits a
 *  single hidden input (default `custom`) holding the JSON value bag so it
 *  submits with the surrounding form. The server re-validates authoritatively. */

export function DynamicCustomFields({
  fields,
  initial = {},
  name = 'custom',
}: {
  fields: CustomFieldDef[];
  initial?: Record<string, unknown>;
  name?: string;
}) {
  const { t, locale } = useI18n();
  const active = useMemo(() => fields.filter((f) => f.is_active).sort((a, b) => a.sort - b.sort), [fields]);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...initial }));

  if (active.length === 0) return null;
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));
  const label = (f: CustomFieldDef) => (locale === 'ar' ? f.label_ar : f.label_en || f.label_ar);
  const optLabel = (o: { value: string; label_ar?: string; label_en?: string }) =>
    (locale === 'ar' ? o.label_ar : o.label_en) || o.value;

  return (
    <div className="space-y-4 rounded-lg border border-dashed p-4">
      <div className="text-sm font-medium text-muted-foreground">{t('customFields.formSection')}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((f) => {
          if (!isFieldVisible(f, values)) return null;
          const v = values[f.key];
          const req = f.required;
          const lab = (
            <Label htmlFor={`cf-${f.key}`}>
              {label(f)}{req && <span className="text-destructive"> *</span>}
            </Label>
          );
          switch (f.type) {
            case 'boolean':
              return (
                <div key={f.key} className="flex items-center gap-2 pt-6">
                  <input id={`cf-${f.key}`} type="checkbox" className="h-4 w-4"
                    checked={Boolean(v)} onChange={(e) => set(f.key, e.target.checked)} />
                  {label(f)}
                </div>
              );
            case 'select':
              return (
                <div key={f.key} className="space-y-1.5">
                  {lab}
                  <select id={`cf-${f.key}`} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{optLabel(o)}</option>)}
                  </select>
                </div>
              );
            case 'multiselect': {
              const arr = Array.isArray(v) ? (v as string[]) : [];
              const toggle = (val: string) => set(f.key, arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
              return (
                <div key={f.key} className="space-y-1.5">
                  {lab}
                  <div className="flex flex-wrap gap-2">
                    {f.options.map((o) => (
                      <button key={o.value} type="button" onClick={() => toggle(o.value)}
                        className={`rounded-md border px-2 py-1 text-xs ${arr.includes(o.value) ? 'border-primary bg-primary/10' : 'border-input'}`}>
                        {optLabel(o)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            case 'number':
              return (
                <div key={f.key} className="space-y-1.5">{lab}
                  <Input id={`cf-${f.key}`} type="number" dir="ltr" value={String(v ?? '')}
                    onChange={(e) => set(f.key, e.target.value)} /></div>
              );
            case 'date':
              return (
                <div key={f.key} className="space-y-1.5">{lab}
                  <Input id={`cf-${f.key}`} type="date" dir="ltr" value={String(v ?? '')}
                    onChange={(e) => set(f.key, e.target.value)} /></div>
              );
            case 'file':
              return (
                <div key={f.key} className="space-y-1.5">{lab}
                  <Input id={`cf-${f.key}`} value={String(v ?? '')} placeholder="path/name"
                    onChange={(e) => set(f.key, e.target.value)} /></div>
              );
            default: // text
              return (
                <div key={f.key} className="space-y-1.5">{lab}
                  <Input id={`cf-${f.key}`} value={String(v ?? '')}
                    onChange={(e) => set(f.key, e.target.value)} /></div>
              );
          }
        })}
      </div>
      {/* Submitted with the surrounding form; server re-validates. */}
      <input type="hidden" name={name} value={JSON.stringify(values)} />
    </div>
  );
}
