import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ErpCustomer, ProductCatalog, SalesReturn } from '@/lib/erp/types';
import { ReturnsManager } from './returns-manager';

export interface ReturnRow extends SalesReturn {
  customer: { name: string; name_ar: string | null } | null;
}

export default async function ReturnsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: returns }, { data: customers }, { data: branches }, { data: products }] =
    await Promise.all([
      supabase
        .from('erp_sales_returns')
        .select('*, customer:erp_customers(name, name_ar)')
        .order('created_at', { ascending: false }),
      supabase.from('erp_customers').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
      supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
    ]);

  return (
    <div>
      <PageHeader title="مرتجعات المبيعات" description="إرجاع البضاعة للمخزون وتسوية حساب العميل" />
      <ReturnsManager
        returns={(returns as ReturnRow[]) ?? []}
        customers={(customers as ErpCustomer[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
      />
    </div>
  );
}
