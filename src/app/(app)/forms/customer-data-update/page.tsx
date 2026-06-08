import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { loadGovernanceInputs } from '@/lib/erp/field-governance-server';
import { resolveLayout, type AccessLevel } from '@/lib/erp/field-governance';
import { resolveFormOptions } from '@/lib/form-builder/options-server';
import { PageHeader } from '@/components/shared/page-header';
import { FORM_BUILDER_ENABLED, customerDataUpdateForm, type FormDefinition } from '@/lib/form-builder';
import { CustomerDataUpdateRunner } from './runner';

export const dynamic = 'force-dynamic';

const FORM_CODE = 'customer_data_update';
const ENTITY = 'customer';

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function CustomerDataUpdatePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!FORM_BUILDER_ENABLED()) notFound();
  if (!hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'customers.manage')) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();

  // Prefer the seeded published schema; fall back to the canonical TS definition
  // so the page works even before the seed migration is applied.
  const def = await safe<FormDefinition>(async () => {
    const { data: form } = await supabase.from('erp_forms').select('id').eq('code', FORM_CODE).eq('is_active', true).maybeSingle();
    if (!form) return customerDataUpdateForm();
    const { data: ver } = await supabase
      .from('erp_form_versions').select('schema')
      .eq('form_id', (form as { id: string }).id).eq('status', 'published')
      .order('version', { ascending: false }).limit(1).maybeSingle();
    const schema = (ver as { schema?: FormDefinition } | null)?.schema;
    return schema && Array.isArray(schema.sections) && schema.sections.length ? schema : customerDataUpdateForm();
  }, customerDataUpdateForm());

  // Resolve dynamic master-data options (classification/channel/segment/route).
  const renderedDef = await safe<FormDefinition>(() => resolveFormOptions(supabase, def), def);

  // Resolve the customer entity's governed layout through the SINGLE path and pass
  // the serializable access map to the client renderer.
  const accessByGovKey = await safe<Record<string, AccessLevel>>(async () => {
    const inputs = await loadGovernanceInputs(supabase, ctx, ENTITY);
    return Object.fromEntries(resolveLayout(inputs, {}));
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader title={t('formBuilder.cduTitle')} description={t('formBuilder.cduDescription')} />
      <CustomerDataUpdateRunner def={renderedDef} accessByGovKey={accessByGovKey} />
    </div>
  );
}
