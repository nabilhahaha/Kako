import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { FormFill } from '../form-fill';
import type { PreviewField } from '@/app/(app)/settings/forms/[id]/form-preview';
import type { FieldType } from '@/lib/erp/form-builder';
import type { Condition, Validation } from '@/lib/erp/form-rules';

interface FieldRow {
  key: string; label_ar: string | null; label_en: string | null; help_ar: string | null; help_en: string | null;
  type: FieldType; section: string | null; sort_order: number; required: boolean;
  options: unknown | null; default_value: string | null; visibility: unknown | null; validation: unknown | null;
}

function parseOptions(raw: unknown): { value: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is { value: string; label: string } => !!o && typeof o === 'object' && 'value' in o);
}

/** Runtime form fill page (B5). Optional ?record=<id> binds the submission to an
 *  existing target row (used by update_field / set_gps effects). */
export default async function FormFillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ record?: string }> }) {
  const { id } = await params;
  const { record } = await searchParams;
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data: form } = await supabase
    .from('erp_form_definitions')
    .select('id, key, name_ar, name_en, status, company_id')
    .eq('id', id).maybeSingle();
  const f = form as { id: string; key: string; name_ar: string | null; name_en: string | null; status: string; company_id: string | null } | null;
  if (!f) notFound();

  const { data: fieldRows } = await supabase
    .from('erp_form_fields')
    .select('key, label_ar, label_en, help_ar, help_en, type, section, sort_order, required, options, default_value, visibility, validation')
    .eq('form_id', id)
    .order('sort_order', { ascending: true });

  const fields: PreviewField[] = ((fieldRows as FieldRow[]) ?? []).map((r) => ({
    key: r.key, type: r.type, labelAr: r.label_ar, labelEn: r.label_en, helpAr: r.help_ar, helpEn: r.help_en,
    section: r.section, required: r.required, options: parseOptions(r.options), defaultValue: r.default_value,
    visibility: (r.visibility as Condition | null) ?? null, validation: (r.validation as Validation | null) ?? null,
  }));

  const title = (locale === 'ar' ? f.name_ar || f.name_en : f.name_en || f.name_ar) || f.key;

  return (
    <div>
      <BackLink href="/forms" label={t('formsRun.backToForms')} />
      <PageHeader title={title} description={f.status !== 'active' ? t('formsRun.errors.notActive') : t('formsRun.fillSubtitle')} />
      {f.status !== 'active' ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('formsRun.errors.notActive')}</CardContent></Card>
      ) : (
        <FormFill formId={f.id} fields={fields} recordId={record} />
      )}
    </div>
  );
}
