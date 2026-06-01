import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { FormDesigner, type DbField, type DbForm, type WorkflowOpt } from './form-designer';

export default async function FormDesignerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('forms.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('forms.adminOnly')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: form } = await supabase
    .from('erp_form_definitions')
    .select('id, company_id, key, name_ar, name_en, module, target_entity, workflow_key, status, version')
    .eq('id', id)
    .maybeSingle();
  if (!form) notFound();

  const { data: fields } = await supabase
    .from('erp_form_fields')
    .select('id, key, label_ar, label_en, help_ar, help_en, type, section, sort_order, required, options, default_value')
    .eq('form_id', id)
    .order('sort_order', { ascending: true });

  const { data: wfs } = await supabase.from('erp_workflow_definitions').select('key, name_ar, name_en').order('key', { ascending: true });
  const seen = new Set<string>();
  const workflows: WorkflowOpt[] = [];
  for (const w of (wfs as WorkflowOpt[] | null) ?? []) { if (!seen.has(w.key)) { seen.add(w.key); workflows.push(w); } }

  const readOnly = (form as DbForm).company_id === null; // global templates are read-only here

  return (
    <div>
      <BackLink href="/settings/forms" label={t('forms.backToList')} />
      <PageHeader
        title={(form as DbForm).name_en || (form as DbForm).key}
        description={readOnly ? t('forms.templateReadonly') : t('forms.designSubtitle')}
      />
      <FormDesigner form={form as DbForm} fields={(fields as DbField[]) ?? []} workflows={workflows} readOnly={readOnly} />
    </div>
  );
}
