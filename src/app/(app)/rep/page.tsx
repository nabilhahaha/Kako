import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import type { Branch, ErpCustomer, ProductCatalog } from '@/lib/erp/types';
import { RepTerminal } from './rep-terminal';

export default async function RepPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: customers }, { data: branches }, { data: products }] = await Promise.all([
    supabase.from('erp_customers').select('*').eq('is_active', true).order('name'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
  ]);

  return (
    <RepTerminal
      customers={(customers as ErpCustomer[]) ?? []}
      branches={(branches as Branch[]) ?? []}
      products={(products as ProductCatalog[]) ?? []}
    />
  );
}
