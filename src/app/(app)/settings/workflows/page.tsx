import { redirect } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { ModulePage } from '@/components/admin/module-page';
import { TopGroupingNav } from '@/components/admin/top-grouping-nav';
import { loadApprovalMatrix } from '@/lib/onboarding/approval-matrix-server';
import { WorkflowBuilder, type WfDefinition, type WfStep, type WfVersion } from './workflow-builder';
import { ApprovalMatrixManager } from '../approval-matrix/approval-matrix-manager';
import { TemplatesClient } from './templates/templates-client';
import { listWorkflowTemplates } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Workflows (M3-A) — one page with three tabs that EACH render their existing
 * manager verbatim: Approvals (ApprovalMatrixManager), Builder (WorkflowBuilder),
 * Templates (TemplatesClient). Tabs are URL-addressable (`?tab=`) so only the
 * active tab's data loads (lazy) and deep links / redirects land correctly. All
 * three share the `workflow.manage` gate, so tabbing changes no access. Reuse
 * only — no manager, action, RLS, or workflow change.
 */
type Tab = 'approvals' | 'builder' | 'templates';

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!hasPermission(ctx, 'workflow.manage')) {
    return (
      <div>
        <PageHeader title={t('settingsHome.workflows')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('workflows.noAccess')}</CardContent></Card>
      </div>
    );
  }

  const sp = await searchParams;
  const tab: Tab = sp.tab === 'builder' ? 'builder' : sp.tab === 'templates' ? 'templates' : 'approvals';

  let content: React.ReactNode;
  if (tab === 'builder') {
    const supabase = await createClient();
    const [{ data: defs }, { data: steps }, { data: versions }] = await Promise.all([
      supabase.from('erp_workflow_definitions').select('*').order('key'),
      supabase.from('erp_workflow_steps').select('*').order('step_no'),
      supabase.from('erp_workflow_definition_versions').select('id, definition_id, version, published_at, published_by').order('version', { ascending: false }),
    ]);
    content = (
      <WorkflowBuilder
        definitions={(defs as WfDefinition[]) ?? []}
        steps={(steps as WfStep[]) ?? []}
        versions={(versions as WfVersion[]) ?? []}
        companyId={ctx.companyId}
        userId={ctx.userId}
      />
    );
  } else if (tab === 'templates') {
    const templates = await listWorkflowTemplates();
    content = templates.length === 0
      ? <EmptyState icon={<LayoutGrid className="h-7 w-7" />} title={t('workflowBuilder.noTemplates')} />
      : <TemplatesClient templates={templates} />;
  } else {
    const res = await loadApprovalMatrix();
    const data = res.ok && res.data ? res.data : { scenarios: [], roles: [] };
    content = <ApprovalMatrixManager scenarios={data.scenarios} roles={data.roles} />;
  }

  const tabs = [
    { key: 'approvals', label: t('approvalMatrix.pageTitle'), href: '/settings/workflows?tab=approvals', active: tab === 'approvals' },
    { key: 'builder', label: t('workflows.title'), href: '/settings/workflows?tab=builder', active: tab === 'builder' },
    { key: 'templates', label: t('workflowBuilder.templatesTitle'), href: '/settings/workflows?tab=templates', active: tab === 'templates' },
  ];

  return (
    <ModulePage title={t('settingsHome.workflows')} nav={<TopGroupingNav items={tabs} ariaLabel={t('settingsHome.workflows')} />}>
      {content}
    </ModulePage>
  );
}
