import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { PurchasingManager } from './purchasing-manager';

export const dynamic = 'force-dynamic';

/** Pharmacy Purchasing & Reorder — low-stock suggestions → supplier POs → receive. */
export default async function PharmacyPurchasingPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('inventory.adjust') || perms.includes('purchasing.manage') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.purchase_orders'] !== true) redirect('/pharmacy/dashboard');

  const { data: suppliers } = await supabase
    .from('erp_suppliers').select('id, name, name_ar').eq('is_active', true).order('name').limit(200);

  return (
    <div>
      <PageHeader title={t('pharmPurchasing.title')} description={t('pharmPurchasing.description')} />
      <PurchasingManager
        suppliers={(suppliers as Array<{ id: string; name: string; name_ar: string | null }>) ?? []}
      />
    </div>
  );
}
