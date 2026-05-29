import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { PricesEditor, type TierOpt, type PriceRow } from './prices-editor';

export default async function WholesalePricesPage({ searchParams }: { searchParams: Promise<{ tier?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="قائمة الأسعار" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">يتم من داخل حساب الشركة.</p></div>);
  }
  const supabase = await createClient();
  const { data: tiers } = await supabase.from('erp_wholesale_tiers').select('id, name').eq('is_active', true).order('sort').order('name');
  const tierList = (tiers as TierOpt[]) ?? [];
  const sp = await searchParams;
  const tierId = sp.tier && tierList.some((t) => t.id === sp.tier) ? sp.tier : (tierList[0]?.id ?? null);

  if (!tierId) {
    return (
      <div>
        <PageHeader title="قائمة الأسعار" />
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">أضِف مستوى سعر أولاً من «مستويات الأسعار».</CardContent></Card>
      </div>
    );
  }

  const [{ data: products }, { data: prices }] = await Promise.all([
    supabase.from('erp_products_catalog').select('id, name, name_ar, sell_price').eq('is_active', true).order('name').limit(1000),
    supabase.from('erp_wholesale_prices').select('product_id, price').eq('tier_id', tierId),
  ]);
  const priceMap = new Map(((prices as { product_id: string; price: number }[]) ?? []).map((p) => [p.product_id, Number(p.price)]));
  const rows: PriceRow[] = ((products as { id: string; name: string; name_ar: string | null; sell_price: number }[]) ?? []).map((p) => ({
    id: p.id, name: p.name_ar || p.name, base: Number(p.sell_price || 0), price: priceMap.get(p.id) ?? null,
  }));

  return (
    <div>
      <PageHeader title="قائمة أسعار الجملة" description="حدّد سعر كل صنف في المستوى المختار." />
      <PricesEditor tiers={tierList} tierId={tierId} rows={rows} />
    </div>
  );
}
