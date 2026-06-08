'use client';

// ============================================================================
// Form Builder — renderer (Phase 8F-2). Renders a published FormDefinition,
// honoring conditional visibility (showWhen) AND Dynamic Field Governance: the
// governed access map (resolved server-side through the single field-governance
// path and passed as `accessByGovKey`) decides hidden / read-only / required per
// field. Reuses the custom-field type vocabulary + the survey yesno/rating types.
// ============================================================================

import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { useI18n } from '@/lib/i18n/provider';
import type { AccessLevel } from '@/lib/erp/field-governance';
import {
  resolveFormFields,
  validateGovernedResponse,
  type FormDefinition,
  type FormField,
  type FormAnswers,
} from '@/lib/form-builder';

export interface FormRendererProps {
  def: FormDefinition;
  /** Governed access keyed by field.governanceKey (resolved server-side). */
  accessByGovKey?: Record<string, AccessLevel>;
  defaultValues?: FormAnswers;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (answers: FormAnswers) => void | Promise<void>;
}

function ratingMax(f: FormField): number {
  return f.max && f.max > 0 ? f.max : 5;
}

export function FormRenderer({ def, accessByGovKey = {}, defaultValues = {}, submitting, submitLabel, onSubmit }: FormRendererProps) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const [answers, setAnswers] = useState<FormAnswers>(defaultValues);
  const [errors, setErrors] = useState<string[]>([]);

  const resolved = useMemo(() => resolveFormFields(def, answers, accessByGovKey), [def, answers, accessByGovKey]);
  const accessByKey = useMemo(() => {
    const m = new Map(resolved.map((r) => [r.field.key, r]));
    return m;
  }, [resolved]);

  const label = (f: FormField) => (ar && f.labelAr ? f.labelAr : f.label);
  const optLabel = (o: { value: string; label?: string; labelAr?: string }) =>
    (ar && o.labelAr ? o.labelAr : o.label) ?? o.value;

  function setValue(key: string, value: unknown) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problems = validateGovernedResponse(def, answers, accessByGovKey);
    setErrors(problems);
    if (problems.length) return;
    await onSubmit(answers);
  }

  function renderControl(f: FormField, readOnly: boolean) {
    const v = answers[f.key];
    const disabled = readOnly || submitting;
    switch (f.type) {
      case 'number':
      case 'rating': {
        const max = f.type === 'rating' ? ratingMax(f) : f.max;
        return (
          <Input
            type="number" inputMode="numeric" disabled={disabled}
            min={f.type === 'rating' ? 0 : undefined} max={max}
            value={v == null ? '' : String(v)}
            onChange={(e) => setValue(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
          />
        );
      }
      case 'date':
        return <Input type="date" disabled={disabled} value={v == null ? '' : String(v)} onChange={(e) => setValue(f.key, e.target.value)} />;
      case 'boolean':
      case 'yesno':
        return (
          <Select disabled={disabled} value={v == null ? '' : String(v)} onChange={(e) => setValue(f.key, e.target.value === '' ? undefined : e.target.value === 'true')}>
            <option value="">—</option>
            <option value="true">{t('formBuilder.yes')}</option>
            <option value="false">{t('formBuilder.no')}</option>
          </Select>
        );
      case 'select':
        return (
          <Select disabled={disabled} value={v == null ? '' : String(v)} onChange={(e) => setValue(f.key, e.target.value || undefined)}>
            <option value="">—</option>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{optLabel(o)}</option>
            ))}
          </Select>
        );
      case 'multiselect': {
        const arr = Array.isArray(v) ? (v as string[]) : [];
        return (
          <div className="flex flex-wrap gap-3">
            {(f.options ?? []).map((o) => {
              const checked = arr.includes(o.value);
              return (
                <label key={o.value} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox" disabled={disabled} checked={checked}
                    onChange={(e) => setValue(f.key, e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))}
                  />
                  {optLabel(o)}
                </label>
              );
            })}
          </div>
        );
      }
      case 'file':
        return <Input type="file" disabled={disabled} onChange={(e) => setValue(f.key, e.target.files?.[0]?.name ?? undefined)} />;
      default: // text
        return <Input type="text" disabled={disabled} value={v == null ? '' : String(v)} onChange={(e) => setValue(f.key, e.target.value || undefined)} />;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {def.sections.map((section) => {
        const visibleFields = section.fields.filter((f) => accessByKey.get(f.key)?.visible);
        if (visibleFields.length === 0) return null;
        return (
          <section key={section.key} className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">{ar && section.titleAr ? section.titleAr : section.title}</h3>
            <div className="space-y-4">
              {visibleFields.map((f) => {
                const r = accessByKey.get(f.key)!;
                return (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={f.key}>
                      {label(f)}
                      {r.required && <span className="text-destructive"> *</span>}
                    </Label>
                    {renderControl(f, r.readOnly)}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((msg) => <FieldError key={msg}>{msg}</FieldError>)}
        </div>
      )}

      <Button type="submit" disabled={submitting}>
        {submitLabel ?? t('formBuilder.submit')}
      </Button>
    </form>
  );
}
