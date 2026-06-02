import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { ProductCatalog, ProductCategory } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { ProductsManager } from './products-manager';

export default async function ProductsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: products }, { data: categories }, { data: etaSettings }] = await Promise.all([
    supabase.from('erp_products_catalog').select('*').order('code'),
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
      />
    </div>
  );
}
