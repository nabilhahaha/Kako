import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { ProductCatalog, ProductCategory } from '@/lib/erp/types';
import { ProductsManager } from './products-manager';

export default async function ProductsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('erp_products_catalog').select('*').order('code'),
    supabase.from('erp_product_categories').select('*').order('code'),
  ]);

  return (
    <div>
      <PageHeader
        title="المنتجات"
        description="كتالوج المنتجات والأسعار والتصنيفات"
      />
      <ProductsManager
        products={(products as ProductCatalog[]) ?? []}
        categories={(categories as ProductCategory[]) ?? []}
        showDrugCatalog={ctx.modules.includes('pharmacy') || ctx.modules.includes('clinic')}
      />
    </div>
  );
}
