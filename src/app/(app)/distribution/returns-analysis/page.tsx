import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ReturnsAnalysisScreen, type ReasonRow } from './returns-analysis-screen';

export default async function ReturnsAnalysisPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'report.aggregate.view')) {
    return (
      <div>
        <PageHeader title={t('fmcgw1.returnsTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('fmcgw1.notPermitted')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: reasons } = await supabase
    .from('erp_return_reasons')
    .select('id, code, label_en, label_ar, is_active, sort')
    .order('sort');

  return (
    <div>
      <PageHeader title={t('fmcgw1.returnsTitle')} description={t('fmcgw1.returnsDescription')} />
      <ReturnsAnalysisScreen
        reasons={(reasons as ReasonRow[]) ?? []}
        canManageReasons={hasPermission(ctx, 'return.reason.manage')}
      />
    </div>
  );
}
