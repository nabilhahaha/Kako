import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { ProductsManager } from './products-manager';

export default async function FashionProductsPage() {
  const { t } = await getT();
  await requirePermission('fashion.inventory');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.products.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }

  const supabase = await createClient();
  const [
    { data: styles }, { data: variants }, { data: sizes }, { data: colors },
    { data: seasons }, { data: brands }, { data: categories }, { data: suppliers },
  ] = await Promise.all([
    supabase.from('erp_fashion_styles').select('id, name, code, gender').order('created_at', { ascending: false }),
    supabase.from('erp_fashion_variants').select('id, style_id, size_id, color_id, installment_price, product:erp_products_catalog(code, barcode, sell_price, cost_price, min_stock, is_active)'),
    supabase.from('erp_fashion_sizes').select('id, code, name').eq('is_active', true).order('sort'),
    supabase.from('erp_fashion_colors').select('id, code, name, name_ar').eq('is_active', true).order('sort'),
    supabase.from('erp_fashion_seasons').select('id, name, name_ar').eq('is_active', true),
    supabase.from('erp_fashion_brands').select('id, name').eq('is_active', true),
    supabase.from('erp_product_categories').select('id, name').eq('is_active', true),
    supabase.from('erp_suppliers').select('id, name').eq('is_active', true),
  ]);

  return (
    <div>
      <PageHeader title={t('fashion.products.title')} description={t('fashion.products.description')} />
      <ProductsManager
        styles={(styles as never) ?? []}
        variants={(variants as never) ?? []}
        sizes={(sizes as never) ?? []}
        colors={(colors as never) ?? []}
        seasons={(seasons as never) ?? []}
        brands={(brands as never) ?? []}
        categories={(categories as never) ?? []}
        suppliers={(suppliers as never) ?? []}
      />
    </div>
  );
}
