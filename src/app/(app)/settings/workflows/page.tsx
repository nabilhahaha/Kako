import { redirect } from 'next/navigation';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { WorkflowBuilder, type WfDefinition, type WfStep, type WfVersion } from './workflow-builder';

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
  // select('*') keeps the page resilient if the Builder migrations (0176–0180) are
  // not yet applied (e.g. before the guarded prod apply): unknown columns are simply
  // absent rather than erroring.
  const [{ data: defs }, { data: steps }, { data: versions }] = await Promise.all([
    supabase.from('erp_workflow_definitions').select('*').order('key'),
    supabase.from('erp_workflow_steps').select('*').order('step_no'),
    supabase.from('erp_workflow_definition_versions').select('id, definition_id, version, published_at, published_by').order('version', { ascending: false }),
  ]);

  return (
    <div>
      <PageHeader title={t('workflows.title')} description={t('workflows.subtitle')} />
      <WorkflowBuilder
        definitions={(defs as WfDefinition[]) ?? []}
        steps={(steps as WfStep[]) ?? []}
        versions={(versions as WfVersion[]) ?? []}
        companyId={ctx.companyId}
        userId={ctx.userId}
      />
    </div>
  );
}
