import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { CashierTerminal, type CashierProduct, type BranchOption } from './cashier-terminal';

export default async function MarketPosPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="الكاشير" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">يتم البيع من داخل حساب المتجر.</p></div>);
  }
  const supabase = await createClient();
  const [{ data: branches }, { data: products }] = await Promise.all([
    supabase.from('erp_branches').select('id, name, name_ar').eq('is_active', true).order('code'),
    supabase.from('erp_products_catalog').select('id, code, name, name_ar, barcode, sell_price, unit, tax_rate').eq('is_active', true).order('name').limit(2000),
  ]);
  return (
    <div>
      <PageHeader title="الكاشير" description="بيع سريع بالباركود — نقدي/فيزا مع حساب الباقي." />
      <CashierTerminal
        branches={(branches as BranchOption[]) ?? []}
        products={(products as CashierProduct[]) ?? []}
      />
    </div>
  );
}
