import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { PriceBookManager, type PriceBookRow } from './price-book-manager';

export default async function PriceBookPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  if (!hasPermission(ctx, 'pricing.manage') && !hasPermission(ctx, 'pricing.view')) {
    return (
      <div>
        <PageHeader title={t('fmcgw1.pricingTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('fmcgw1.notPermitted')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_prices')
    .select('id, product_id, uom, channel_id, customer_id, min_qty, price, currency, effective_from, effective_to, is_active')
    .order('effective_from', { ascending: false })
    .limit(200);

  const rows = (data as PriceBookRow[]) ?? [];

  // Resolve product labels for the rows we show (no raw UUIDs in the UI).
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const labels: Record<string, string> = {};
  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from('erp_products_catalog')
      .select('id, code, name, name_ar')
      .in('id', productIds);
    for (const p of (prods as { id: string; code: string; name: string; name_ar: string | null }[]) ?? []) {
      labels[p.id] = (locale === 'ar' ? p.name_ar || p.name : p.name) || p.code;
    }
  }

  const canManage = hasPermission(ctx, 'pricing.manage');

  return (
    <div>
      <PageHeader title={t('fmcgw1.pricingTitle')} description={t('fmcgw1.pricingDescription')} />
      <PriceBookManager rows={rows} productLabels={labels} canManage={canManage} />
    </div>
  );
}
