import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsSubnav } from '@/components/shared/settings-subnav';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadApprovalMatrix } from '@/lib/onboarding/approval-matrix-server';
import { ApprovalMatrixManager } from './approval-matrix-manager';

/**
 * "Approvals" — a business-friendly Approval Matrix over the existing workflow
 * engine. Each scenario (credit limit, price exception, …) is configured as
 * approver tiers; saving writes/maintains the company's workflow definition +
 * steps and publishes via the existing engine. Cards per the Back Office UX
 * standard; no technical terminology.
 */
export default async function ApprovalMatrixPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  if (!hasPermission(ctx, 'workflow.manage')) {
    return (
      <div>
        <PageHeader title={t('approvalMatrix.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('approvalMatrix.adminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const res = await loadApprovalMatrix();
  const data = res.ok && res.data ? res.data : { scenarios: [], roles: [] };

  return (
    <div>
      <SettingsSubnav
        backLabel={t('related.backToSettings')}
        relatedLabel={t('related.title')}
        related={[{ href: '/settings/workflows', label: t('settingsHome.workflows') }, { href: '/settings/workflows/templates', label: t('settingsHome.workflowTemplates') }]}
      />
      <PageHeader title={t('approvalMatrix.pageTitle')} description={t('approvalMatrix.pageDescription')} />
      <ApprovalMatrixManager scenarios={data.scenarios} roles={data.roles} />
    </div>
  );
}
