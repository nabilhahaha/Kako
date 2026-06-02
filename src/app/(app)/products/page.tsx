import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Pager } from '@/components/pager';
import type { ProductCatalog, ProductCategory } from '@/lib/erp/types';
import { parseListParams, applySearch } from '@/lib/erp/list-query';
import { getT } from '@/lib/i18n/server';
import { ProductsManager } from './products-manager';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const sp = await searchParams;
  const { page, q, pageSize, from, to } = parseListParams(sp);

  const supabase = await createClient();
  let listQuery = supabase.from('erp_products_catalog').select('*', { count: 'exact' }).order('code');
  listQuery = applySearch(listQuery, q, ['code', 'name', 'name_ar', 'barcode']);
  const [{ data: products, count }, { data: categories }, { data: etaSettings }] = await Promise.all([
    listQuery.range(from, to),
    supabase.from('erp_product_categories').select('*').order('code'),
    supabase.from('erp_company_eta_settings').select('enabled').eq('company_id', ctx.companyId).maybeSingle(),
  ]);
  const etaEnabled = Boolean(etaSettings?.enabled);

  return (
    <div>
      <PageHeader
        title={t('products.pageTitle')}
        description={t('products.pageDescription')}
      />
      <ProductsManager
        products={(products as ProductCatalog[]) ?? []}
        categories={(categories as ProductCategory[]) ?? []}
        showDrugCatalog={ctx.modules.includes('pharmacy') || ctx.modules.includes('clinic')}
        etaEnabled={etaEnabled}
        q={q}
      />
      <Pager page={page} pageSize={pageSize} total={count ?? 0} basePath="/products" query={{ q: q || undefined }} />
    </div>
  );
}
