import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { CustomerTiers, type CustomerRow, type TierOpt } from './customer-tiers';

export default async function WholesaleCustomersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="مستويات العملاء" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">يتم من داخل حساب الشركة.</p></div>);
  }
  const supabase = await createClient();
  const [{ data: customers }, { data: tiers }, { data: assign }] = await Promise.all([
    supabase.from('erp_customers').select('id, code, name, name_ar').order('name').limit(1000),
    supabase.from('erp_wholesale_tiers').select('id, name').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_wholesale_customer_tier').select('customer_id, tier_id'),
  ]);
  const tierByCustomer = new Map(((assign as { customer_id: string; tier_id: string | null }[]) ?? []).map((a) => [a.customer_id, a.tier_id]));
  const rows: CustomerRow[] = ((customers as { id: string; code: string; name: string; name_ar: string | null }[]) ?? [])
    .map((c) => ({ id: c.id, code: c.code, name: c.name_ar || c.name, tier_id: tierByCustomer.get(c.id) ?? null }));

  return (
    <div>
      <PageHeader title="مستويات العملاء" description="حدّد مستوى السعر لكل عميل." />
      <CustomerTiers rows={rows} tiers={(tiers as TierOpt[]) ?? []} />
    </div>
  );
}
