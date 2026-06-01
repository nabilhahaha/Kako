import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { captureKindFor, type CaptureKind } from '@/lib/erp/field-capture';
import { CaptureLauncher, type CaptureForm, type CaptureHistory } from './capture-launcher';

/** In-visit capture launcher (FE-4b): the active field_ops capture forms for a
 *  customer (+ optional visit), grouped by kind, plus recent captures. */
export default async function CaptureLauncherPage({ searchParams }: { searchParams: Promise<{ customer?: string; visit?: string }> }) {
  const { customer, visit } = await searchParams;
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const companyId = ctx.company?.id;
  if (!companyId || !ctx.modules.includes('field_ops') || !customer) {
    return <div><PageHeader title={t('field.capture.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.capture.none')}</CardContent></Card></div>;
  }

  const supabase = await createClient();
  // The capture kinds this user may execute (per-type Permission Matrix).
  const { data: allowedKinds } = await supabase.rpc('erp_fe_capture_kinds');
  const allowed = new Set((allowedKinds as string[] | null) ?? []);
  if (allowed.size === 0) {
    return <div><PageHeader title={t('field.capture.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.capture.noAccess')}</CardContent></Card></div>;
  }
  const [{ data: cust }, { data: formRows }, { data: capRows }] = await Promise.all([
    supabase.from('erp_customers').select('name, code').eq('id', customer).maybeSingle(),
    supabase.from('erp_form_definitions').select('id, key, name_ar, name_en, company_id').eq('status', 'active').eq('module', 'field_ops').eq('is_latest', true).or(`company_id.eq.${companyId},company_id.is.null`),
    supabase.from('erp_fe_captures').select('id, kind, score, created_at, erp_form_definitions:form_id(name_ar, name_en)').eq('customer_id', customer).order('created_at', { ascending: false }).limit(10),
  ]);

  // dedupe by key, preferring the company form over the global template, then
  // keep only forms whose capture kind the user is permitted to execute.
  const seen = new Map<string, CaptureForm>();
  for (const r of ((formRows as Record<string, unknown>[]) ?? [])) {
    const key = r.key as string;
    const name = (locale === 'ar' ? (r.name_ar as string) : (r.name_en as string)) || (r.name_en as string) || key;
    const existing = seen.get(key);
    if (!existing || (r.company_id !== null && existing)) seen.set(key, { id: r.id as string, key, name, kind: captureKindFor(key) });
  }
  const forms = [...seen.values()].filter((f) => allowed.has(f.kind));

  const history: CaptureHistory[] = ((capRows as Record<string, unknown>[]) ?? []).map((r) => {
    const f = r.erp_form_definitions as { name_ar?: string; name_en?: string } | null;
    return { id: r.id as string, kind: r.kind as CaptureKind, score: (r.score as number) ?? null, createdAt: r.created_at as string, formName: (locale === 'ar' ? f?.name_ar : f?.name_en) || f?.name_en || '' };
  });

  const customerName = (cust as { name?: string; code?: string } | null)?.name ?? '';

  return (
    <div className="mx-auto max-w-md">
      <BackLink href={`/field/customers/${customer}`} label={t('field.capture.back')} />
      <PageHeader title={t('field.capture.title')} description={`${t('field.capture.for')}: ${customerName}`} />
      <CaptureLauncher customerId={customer} visitId={visit ?? null} forms={forms} history={history} />
    </div>
  );
}
