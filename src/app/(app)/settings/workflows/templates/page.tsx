import { redirect, notFound } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { WORKFLOW_BUILDER_ENABLED } from '@/lib/workflow-builder';
import { listWorkflowTemplates } from '../actions';
import { TemplatesClient } from './templates-client';

export const dynamic = 'force-dynamic';

/** Workflow Builder — reusable approval-template catalog (8A). Clone a template
 *  into a new draft definition. Flag-gated (KAKO_WORKFLOW_BUILDER) + workflow.manage. */
export default async function WorkflowTemplatesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'workflow.manage')) redirect('/dashboard');
  if (!WORKFLOW_BUILDER_ENABLED()) notFound();

  const { t } = await getT();
  const templates = await listWorkflowTemplates();

  return (
    <div className="space-y-6">
      <PageHeader title={t('workflowBuilder.templatesTitle')} description={t('workflowBuilder.templatesDescription')} />
      {templates.length === 0
        ? <EmptyState icon={<LayoutGrid className="h-7 w-7" />} title={t('workflowBuilder.noTemplates')} />
        : <TemplatesClient templates={templates} />}
    </div>
  );
}
