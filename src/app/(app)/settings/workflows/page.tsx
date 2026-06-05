import { redirect } from 'next/navigation';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { WorkflowBuilder, type WfDefinition, type WfStep } from './workflow-builder';

/** ── Workflow Builder Lite (workflow.manage) ───────────────────────────────
 *  Company admins build approval workflows (definitions + steps) on the generic
 *  engine. Global templates are shown read-only. */
export default async function WorkflowsPage() {
  await requireNonRetailAdmin();
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!hasPermission(ctx, 'workflow.manage')) {
    return (
      <div>
        <PageHeader title={t('workflows.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('workflows.noAccess')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: defs }, { data: steps }] = await Promise.all([
    supabase.from('erp_workflow_definitions').select('id, company_id, key, entity, name_ar, name_en, is_active').order('key'),
    supabase.from('erp_workflow_steps').select('id, definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition').order('step_no'),
  ]);

  return (
    <div>
      <PageHeader title={t('workflows.title')} description={t('workflows.subtitle')} />
      <WorkflowBuilder
        definitions={(defs as WfDefinition[]) ?? []}
        steps={(steps as WfStep[]) ?? []}
        companyId={ctx.companyId}
      />
    </div>
  );
}
