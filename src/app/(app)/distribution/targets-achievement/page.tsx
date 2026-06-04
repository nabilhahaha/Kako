import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { TargetsAchievementManager, type TargetRow } from './targets-achievement-manager';

export default async function TargetsAchievementPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!hasPermission(ctx, 'target.view') && !hasPermission(ctx, 'target.manage')) {
    return (
      <div>
        <PageHeader title={t('fmcgw1.targetsTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('fmcgw1.notPermitted')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_targets')
    .select('id, level, scope_id, period, period_start, period_end, metric, target_value')
    .order('period_start', { ascending: false })
    .limit(200);

  const canManage = hasPermission(ctx, 'target.manage');

  return (
    <div>
      <PageHeader title={t('fmcgw1.targetsTitle')} description={t('fmcgw1.targetsDescription')} />
      <TargetsAchievementManager rows={(data as TargetRow[]) ?? []} canManage={canManage} />
    </div>
  );
}
