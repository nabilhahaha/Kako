import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { WholesaleOrder, type WCustomer, type WProduct, type BranchOpt } from './wholesale-order';
import { getT } from '@/lib/i18n/server';

export default async function WholesaleOrderPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('wholesale.orderPageTitleNoCompany')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('wholesale.companyOnly')}</p></div>);
  }
  const supabase = await createClient();
  const [{ data: branches }, { data: customers }, { data: products }, { data: assign }, { data: prices }] = await Promise.all([
    supabase.from('erp_branches').select('id, name, name_ar').eq('is_active', true).order('code'),
    supabase.from('erp_customers').select('id, code, name, name_ar').order('name').limit(1000),
    supabase.from('erp_products_catalog').select('id, name, name_ar, sell_price').eq('is_active', true).order('name').limit(1000),
    supabase.from('erp_wholesale_customer_tier').select('customer_id, tier_id'),
    supabase.from('erp_wholesale_prices').select('tier_id, product_id, price'),
  ]);

  const tierByCustomer = new Map(((assign as { customer_id: string; tier_id: string | null }[]) ?? []).map((a) => [a.customer_id, a.tier_id]));
  const tierPrices: Record<string, number> = {};
  for (const p of (prices as { tier_id: string; product_id: string; price: number }[]) ?? []) tierPrices[`${p.tier_id}|${p.product_id}`] = Number(p.price);

  const wcustomers: WCustomer[] = ((customers as { id: string; code: string; name: string; name_ar: string | null }[]) ?? [])
    .map((c) => ({ id: c.id, name: c.name_ar || c.name, tier_id: tierByCustomer.get(c.id) ?? null }));
  const wproducts: WProduct[] = ((products as { id: string; name: string; name_ar: string | null; sell_price: number }[]) ?? [])
    .map((p) => ({ id: p.id, name: p.name_ar || p.name, sell_price: Number(p.sell_price || 0) }));

  return (
    <div>
      <PageHeader title={t('wholesale.orderPageTitle')} description={t('wholesale.orderPageDescription')} />
      <WholesaleOrder
        branches={(branches as BranchOpt[]) ?? []}
        customers={wcustomers}
        products={wproducts}
        tierPrices={tierPrices}
      />
    </div>
  );
}
