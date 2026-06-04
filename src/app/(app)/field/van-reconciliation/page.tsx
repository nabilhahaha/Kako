import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { VanReconciliationManager, type ReconHeader, type ReconLine } from './van-reconciliation-manager';

export default async function VanReconciliationPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  if (
    !hasPermission(ctx, 'reconciliation.view') &&
    !hasPermission(ctx, 'reconciliation.manage') &&
    !hasPermission(ctx, 'reconciliation.approve')
  ) {
    return (
      <div>
        <PageHeader title={t('fmcgw1.reconTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('fmcgw1.notPermitted')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: headers } = await supabase
    .from('erp_van_reconciliations')
    .select('id, work_session_id, recon_date, status, total_variance_value')
    .order('recon_date', { ascending: false })
    .limit(50);

  const heads = (headers as ReconHeader[]) ?? [];
  let lines: ReconLine[] = [];
  const productLabels: Record<string, string> = {};
  if (heads.length > 0) {
    const { data: lineRows } = await supabase
      .from('erp_van_reconciliation_lines')
      .select('id, reconciliation_id, product_id, expected_qty, actual_qty, variance_qty, variance_value')
      .in('reconciliation_id', heads.map((h) => h.id));
    lines = (lineRows as ReconLine[]) ?? [];
    const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean) as string[])];
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from('erp_products_catalog')
        .select('id, code, name, name_ar')
        .in('id', productIds);
      for (const p of (prods as { id: string; code: string; name: string; name_ar: string | null }[]) ?? []) {
        productLabels[p.id] = (locale === 'ar' ? p.name_ar || p.name : p.name) || p.code;
      }
    }
  }

  return (
    <div>
      <PageHeader title={t('fmcgw1.reconTitle')} description={t('fmcgw1.reconDescription')} />
      <VanReconciliationManager
        headers={heads}
        lines={lines}
        productLabels={productLabels}
        canManage={hasPermission(ctx, 'reconciliation.manage')}
        canApprove={hasPermission(ctx, 'reconciliation.approve')}
      />
    </div>
  );
}
