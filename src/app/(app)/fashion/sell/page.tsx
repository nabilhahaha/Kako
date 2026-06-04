import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { Pos } from './pos';

interface VariantRow {
  installment_price: number;
  product: { id: string; code: string; name: string; barcode: string | null; sell_price: number } | null;
}

export default async function FashionSellPage() {
  const { t, locale } = await getT();
  await requirePermission('fashion.sell');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.sell.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }

  const supabase = await createClient();
  const [{ data: variants }, { data: customers }] = await Promise.all([
    supabase.from('erp_fashion_variants').select('installment_price, product:erp_products_catalog(id, code, name, barcode, sell_price)').eq('is_active', true),
    supabase.from('erp_customers').select('id, name, phone').neq('code', 'WALKIN').eq('is_active', true).order('name'),
  ]);

  const items = ((variants as unknown as VariantRow[]) ?? [])
    .filter((v) => v.product)
    .map((v) => ({
      product_id: v.product!.id, code: v.product!.code, name: v.product!.name,
      barcode: v.product!.barcode ?? '', cash_price: Number(v.product!.sell_price || 0),
      installment_price: Number(v.installment_price || 0),
    }));

  return (
    <div>
      <PageHeader title={t('fashion.sell.title')} description={t('fashion.sell.description')} />
      <Pos items={items} customers={(customers as never) ?? []} locale={locale} />
    </div>
  );
}
