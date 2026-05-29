import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function WholesalePriceListPrint({ searchParams }: { searchParams: Promise<{ tier?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: tiers } = await supabase.from('erp_wholesale_tiers').select('id, name').order('sort').order('name');
  const tierList = (tiers as { id: string; name: string }[]) ?? [];
  const tierId = sp.tier && tierList.some((t) => t.id === sp.tier) ? sp.tier : (tierList[0]?.id ?? null);
  const tier = tierList.find((t) => t.id === tierId) ?? null;

  const [{ data: products }, { data: prices }] = await Promise.all([
    supabase.from('erp_products_catalog').select('id, name, name_ar, sell_price').eq('is_active', true).order('name').limit(1000),
    tierId ? supabase.from('erp_wholesale_prices').select('product_id, price').eq('tier_id', tierId) : Promise.resolve({ data: [] }),
  ]);
  const priceMap = new Map(((prices as { product_id: string; price: number }[]) ?? []).map((p) => [p.product_id, Number(p.price)]));
  const rows = ((products as { id: string; name: string; name_ar: string | null; sell_price: number }[]) ?? [])
    .map((p) => ({ name: p.name_ar || p.name, price: priceMap.get(p.id) ?? Number(p.sell_price || 0) }));
  const name = ctx.company?.name_ar || ctx.company?.name || 'الشركة';

  return (
    <div className="space-y-4 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label="طباعة قائمة الأسعار" /></div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-xl font-bold">{name}</h1>
        <p className="text-sm">قائمة أسعار{tier ? ` — ${tier.name}` : ''}</p>
        <p className="text-xs text-gray-600" dir="ltr">{formatDate(new Date().toISOString())}</p>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">الصنف</th><th className="p-2 text-left">السعر</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b"><td className="p-2">{r.name}</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(r.price)}</td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={2} className="p-2 text-center text-gray-500">لا أصناف</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
