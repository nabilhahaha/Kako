import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsSubnav } from '@/components/shared/settings-subnav';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadNumbering } from '@/lib/onboarding/numbering-server';
import { NumberingManager } from './numbering-manager';

/**
 * "Document Numbering" — business-friendly editor over erp_sequences. Per the
 * Back Office UX standard: cards (one per document type), live preview, plain
 * language. The issuing engine and already-issued numbers are never affected.
 */
export default async function NumberingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!hasPermission(ctx, 'settings.branches')) {
    return (
      <div>
        <PageHeader title={t('numbering.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('numbering.adminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const res = await loadNumbering();
  const data = res.ok && res.data ? res.data : { branches: [], branchId: null, branchCode: null, rows: [] };

  return (
    <div>
      <SettingsSubnav
        backLabel={t('related.backToSettings')}
        relatedLabel={t('related.title')}
        related={[{ href: '/settings/finance', label: t('settingsHome.finance') }, { href: '/settings/tax-registrations', label: t('settingsHome.taxReg') }]}
      />
      <PageHeader title={t('numbering.pageTitle')} description={t('numbering.pageDescription')} />
      <NumberingManager
        branches={data.branches}
        initialBranchId={data.branchId}
        initialBranchCode={data.branchCode}
        initialRows={data.rows}
      />
    </div>
  );
}
