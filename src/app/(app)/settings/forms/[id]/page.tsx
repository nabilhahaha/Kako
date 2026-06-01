import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { FormDesigner, type DbField, type DbForm, type WorkflowOpt } from './form-designer';
import { WorkflowPanel, type WfStep, type RoleOpt, type MemberOpt } from './workflow-panel';

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
    .select('id, company_id, key, name_ar, name_en, module, target_entity, workflow_key, status, version, effect, subject_ref')
    .eq('id', id)
    .maybeSingle();
  if (!form) notFound();

  const { data: fields } = await supabase
    .from('erp_form_fields')
    .select('id, key, label_ar, label_en, help_ar, help_en, type, section, sort_order, required, options, default_value, visibility, validation, config')
    .eq('form_id', id)
    .order('sort_order', { ascending: true });

  const { data: wfs } = await supabase.from('erp_workflow_definitions').select('key, name_ar, name_en').order('key', { ascending: true });
  const seen = new Set<string>();
  const workflows: WorkflowOpt[] = [];
  for (const w of (wfs as WorkflowOpt[] | null) ?? []) { if (!seen.has(w.key)) { seen.add(w.key); workflows.push(w); } }

  const dbForm = form as DbForm;
  const readOnly = dbForm.company_id === null; // global templates are read-only here

  // ── Bound approval workflow (B4): the per-form, form_submission-entity definition ──
  let definitionId: string | null = null;
  let wfSteps: WfStep[] = [];
  if (dbForm.workflow_key) {
    const { data: def } = await supabase
      .from('erp_workflow_definitions')
      .select('id')
      .eq('key', dbForm.workflow_key)
      .eq('entity', 'form_submission')
      .eq('company_id', dbForm.company_id ?? '')
      .maybeSingle();
    definitionId = (def as { id: string } | null)?.id ?? null;
    if (definitionId) {
      const { data: st } = await supabase
        .from('erp_workflow_steps')
        .select('id, definition_id, step_no, approver_type, approver_ref, mode, required_approvals, condition')
        .eq('definition_id', definitionId)
        .order('step_no', { ascending: true });
      wfSteps = (st as WfStep[]) ?? [];
    }
  }
  const [{ data: roles }, { data: members }] = await Promise.all([
    supabase.from('erp_roles').select('key, name_ar').order('rank', { ascending: false }),
    supabase.from('erp_profiles').select('id, full_name, email').eq('is_active', true).order('full_name', { ascending: true }),
  ]);
  const fieldKeys = ((fields as DbField[]) ?? []).filter((f) => f.type !== 'section').map((f) => f.key);

  return (
    <div>
      <BackLink href="/settings/forms" label={t('forms.backToList')} />
      <PageHeader
        title={(form as DbForm).name_en || (form as DbForm).key}
        description={readOnly ? t('forms.templateReadonly') : t('forms.designSubtitle')}
      />
      <FormDesigner form={dbForm} fields={(fields as DbField[]) ?? []} workflows={workflows} readOnly={readOnly} />
      <div className="mt-6">
        <WorkflowPanel
          formId={dbForm.id}
          definitionId={definitionId}
          definitionKey={dbForm.workflow_key}
          steps={wfSteps}
          roles={(roles as RoleOpt[]) ?? []}
          members={(members as MemberOpt[]) ?? []}
          fieldKeys={fieldKeys}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
