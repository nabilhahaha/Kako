import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { SalesSummaryScreen, type BranchOption } from './sales-summary-screen';

export default async function SalesSummaryPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!hasPermission(ctx, 'report.aggregate.view')) {
    return (
      <div>
        <PageHeader title={t('fmcgw1.salesSummaryTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('fmcgw1.notPermitted')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: branches } = await supabase
    .from('erp_branches')
    .select('id, name, code')
    .eq('is_active', true)
    .order('code');

  const branchOptions: BranchOption[] = ((branches as { id: string; name: string; code: string }[]) ?? []).map((b) => ({
    id: b.id,
    label: b.name || b.code,
  }));
  const branchLabels: Record<string, string> = {};
  for (const b of branchOptions) branchLabels[b.id] = b.label;

  return (
    <div>
      <PageHeader title={t('fmcgw1.salesSummaryTitle')} description={t('fmcgw1.salesSummaryDescription')} />
      <SalesSummaryScreen branches={branchOptions} branchLabels={branchLabels} />
    </div>
  );
}
