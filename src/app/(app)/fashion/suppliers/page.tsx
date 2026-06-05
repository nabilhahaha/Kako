import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { SuppliersManager } from './suppliers-manager';

interface VariantRow { product: { id: string; code: string; name: string; cost_price: number } | null }

export default async function FashionSuppliersPage() {
  const { t, locale } = await getT();
  await requirePermission('fashion.purchase');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.suppliers.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }
  const supabase = await createClient();
  const [{ data: suppliers }, { data: variants }] = await Promise.all([
    supabase.from('erp_suppliers').select('id, name, phone, balance').eq('is_active', true).order('name'),
    supabase.from('erp_fashion_variants').select('product:erp_products_catalog(id, code, name, cost_price)').eq('is_active', true),
  ]);
  const products = ((variants as unknown as VariantRow[]) ?? [])
    .filter((v) => v.product)
    .map((v) => ({ product_id: v.product!.id, code: v.product!.code, name: v.product!.name, cost: Number(v.product!.cost_price || 0) }));
  return (
    <div>
      <PageHeader title={t('fashion.suppliers.title')} description={t('fashion.suppliers.description')} />
      <SuppliersManager suppliers={(suppliers as never) ?? []} products={products} locale={locale} />
    </div>
  );
}
