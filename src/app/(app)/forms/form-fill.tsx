'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { computeVisibility, validateSubmission, isRequired, type RuleField } from '@/lib/erp/form-rules';
import { FieldInput, type PreviewField } from '@/app/(app)/settings/forms/[id]/form-preview';
import { submitForm } from './actions';

/** Runtime form renderer (B5): fills, applies live visibility/required/validation
 *  via the shared rules engine, and submits — starting the bound approval
 *  workflow or auto-approving + applying the effect. */
export function FormFill({ formId, fields, recordId }: { formId: string; fields: PreviewField[]; recordId?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<null | 'pending' | 'approved'>(null);
  const [touched, setTouched] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.filter((f) => f.type !== 'section' && f.defaultValue != null).map((f) => [f.key, f.defaultValue])),
  );

  const lab = (f: PreviewField) => (locale === 'ar' ? f.labelAr || f.labelEn : f.labelEn || f.labelAr) || f.key;
  const help = (f: PreviewField) => (locale === 'ar' ? f.helpAr || f.helpEn : f.helpEn || f.helpAr);
  const ruleFields: RuleField[] = fields.map((f) => ({ key: f.key, type: f.type, required: f.required, options: f.options, visibility: f.visibility, validation: f.validation }));
  const visible = computeVisibility(ruleFields, values);
  const errors = validateSubmission(ruleFields, values);
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  function submit() {
    setTouched(true);
    if (Object.keys(errors).length > 0) { toast.error(t('formsRun.fixErrors')); return; }
    start(async () => {
      const res = await submitForm({ formId, values, recordId });
      if (!res.ok) { toast.error(res.error ?? t('formsRun.errors.failed')); return; }
      setDone(res.data?.status ?? 'approved');
      toast.success(res.data?.status === 'pending' ? t('formsRun.sentForApproval') : t('formsRun.submitted'));
      router.refresh();
    });
  }

  if (done) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="font-medium">{done === 'pending' ? t('formsRun.sentForApproval') : t('formsRun.submitted')}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setDone(null); setTouched(false); setValues({}); }}>{t('formsRun.submitAnother')}</Button>
          <Button size="sm" onClick={() => router.push('/forms')}>{t('formsRun.backToForms')}</Button>
        </div>
      </CardContent></Card>
    );
  }

  return (
    <Card><CardContent className="space-y-4 pt-6">
      {fields.length === 0 && <p className="text-sm text-muted-foreground">{t('formsRun.empty')}</p>}
      {fields.map((f, i) => {
        if (!visible[f.key]) return null;
        if (f.type === 'section') return <h4 key={f.key} className="border-b pb-1 pt-2 font-semibold">{lab(f)}</h4>;
        const req = isRequired(ruleFields[i], values);
        const err = touched ? errors[f.key] : undefined;
        return (
          <div key={f.key} className="space-y-1">
            <label className="text-sm font-medium">{lab(f)}{req && <span className="text-destructive"> *</span>}</label>
            <FieldInput f={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
            {help(f) && <p className="text-xs text-muted-foreground">{help(f)}</p>}
            {err && <p className="text-xs text-destructive">{t(`forms.err.${err}`)}</p>}
          </div>
        );
      })}
      {fields.some((f) => f.type !== 'section') && (
        <Button disabled={pending} onClick={submit}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t('formsRun.submit')}</Button>
      )}
    </CardContent></Card>
  );
}
