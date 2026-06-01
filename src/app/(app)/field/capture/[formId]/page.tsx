import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { captureKindFor, type CaptureKind } from '@/lib/erp/field-capture';
import { CaptureFill } from './capture-fill';
import type { PreviewField } from '@/app/(app)/settings/forms/[id]/form-preview';
import type { FieldType } from '@/lib/erp/form-builder';
import type { Condition, Validation } from '@/lib/erp/form-rules';

interface FieldRow {
  key: string; label_ar: string | null; label_en: string | null; help_ar: string | null; help_en: string | null;
  type: FieldType; section: string | null; sort_order: number; required: boolean; options: unknown | null; default_value: string | null; visibility: unknown | null; validation: unknown | null;
}
function parseOptions(raw: unknown): { value: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is { value: string; label: string } => !!o && typeof o === 'object' && 'value' in o);
}

/** Capture fill (FE-4b): the Builder runtime fill bound to a customer (+ visit),
 *  submitting via submitFieldCapture. */
export default async function CaptureFillPage({ params, searchParams }: { params: Promise<{ formId: string }>; searchParams: Promise<{ customer?: string; visit?: string }> }) {
  const { formId } = await params;
  const { customer, visit } = await searchParams;
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.modules.includes('field_ops') || !customer) notFound();

  const supabase = await createClient();
  const { data: form } = await supabase.from('erp_form_definitions').select('id, key, name_ar, name_en, status, module').eq('id', formId).maybeSingle();
  const f = form as { id: string; key: string; name_ar: string | null; name_en: string | null; status: string; module: string | null } | null;
  if (!f || f.module !== 'field_ops' || f.status !== 'active') notFound();

  const kind: CaptureKind = captureKindFor(f.key);
  const { data: canCap } = await supabase.rpc('erp_fe_can_capture', { p_kind: kind });
  if (canCap !== true) {
    return <div className="mx-auto max-w-md"><PageHeader title={t('field.capture.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.capture.noAccess')}</CardContent></Card></div>;
  }

  const { data: fieldRows } = await supabase
    .from('erp_form_fields')
    .select('key, label_ar, label_en, help_ar, help_en, type, section, sort_order, required, options, default_value, visibility, validation')
    .eq('form_id', formId).order('sort_order', { ascending: true });

  const fields: PreviewField[] = ((fieldRows as FieldRow[]) ?? []).map((r) => ({
    key: r.key, type: r.type, labelAr: r.label_ar, labelEn: r.label_en, helpAr: r.help_ar, helpEn: r.help_en,
    section: r.section, required: r.required, options: parseOptions(r.options), defaultValue: r.default_value,
    visibility: (r.visibility as Condition | null) ?? null, validation: (r.validation as Validation | null) ?? null,
  }));
  const title = (locale === 'ar' ? f.name_ar || f.name_en : f.name_en || f.name_ar) || f.key;

  return (
    <div className="mx-auto max-w-md">
      <BackLink href={`/field/capture?customer=${customer}${visit ? `&visit=${visit}` : ''}`} label={t('field.capture.back')} />
      <PageHeader title={title} />
      <Card><CardContent className="pt-6">
        <CaptureFill formId={formId} fields={fields} customerId={customer} visitId={visit ?? null} kind={kind} />
      </CardContent></Card>
    </div>
  );
}
