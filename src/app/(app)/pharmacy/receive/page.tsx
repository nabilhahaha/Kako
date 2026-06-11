import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { ReceiveManager } from './receive-manager';

export const dynamic = 'force-dynamic';

/** Batch Intake / goods receipt — receive stock in the purchase unit. */
export default async function PharmacyReceivePage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('inventory.adjust') || perms.includes('inventory.adjust') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: suppliers }, flags] = await Promise.all([
    supabase.from('erp_suppliers').select('id, name, name_ar').eq('is_active', true).order('name').limit(200),
    getFeatureFlags(supabase, ctx.companyId),
  ]);

  return (
    <div>
      <PageHeader title={t('pharmReceive.title')} description={t('pharmReceive.description')} />
      <ReceiveManager
        suppliers={(suppliers as Array<{ id: string; name: string; name_ar: string | null }>) ?? []}
        batchTracking={flags['pharmacy.batch_tracking'] === true}
        expiryTracking={flags['pharmacy.expiry_tracking'] === true}
      />
    </div>
  );
}
