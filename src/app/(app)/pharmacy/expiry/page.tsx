import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { ExpiryManager } from './expiry-manager';
import type { ExpiryRow } from './actions';

export const dynamic = 'force-dynamic';

/** Inventory Control — expiry risk dashboard + write-off. */
export default async function PharmacyExpiryPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: rows }, flags] = await Promise.all([
    supabase.from('erp_expiry_risk')
      .select('batch_id, product_id, warehouse_id, name, name_ar, code, batch_number, expiry_date, qty_on_hand, days_to_expiry, bucket')
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .limit(500),
    getFeatureFlags(supabase, ctx.companyId),
  ]);

  const list = (rows as ExpiryRow[]) ?? [];
  const summary = { expired: 0, d30: 0, d60: 0, d90: 0 } as Record<string, number>;
  for (const r of list) if (summary[r.bucket] !== undefined) summary[r.bucket] += 1;

  return (
    <div>
      <PageHeader title={t('pharmExpiry.title')} description={t('pharmExpiry.description')} />
      <ExpiryManager
        rows={list.filter((r) => r.bucket !== 'ok' && r.bucket !== 'none')}
        summary={summary}
        canWriteOff={flags['pharmacy.expiry_writeoff_workflow'] === true
          && ((ctx.permissions as string[]).includes('inventory.adjust') || ctx.isSuperAdmin)}
      />
    </div>
  );
}
