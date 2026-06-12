import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requireAnyPermission } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Branch, ErpCustomer } from '@/lib/erp/types';
import { PharmacyPos, type PosFeatureFlags } from './pos-fast';

export const dynamic = 'force-dynamic';

/**
 * Fast Pharmacy POS — keyboard-first, barcode + trigram search. Every advanced
 * behaviour (batch select, FEFO, hold/resume, returns, receipt, discount) is
 * gated by the tenant feature flags resolved here; disabled features never reach
 * the client, so their UI and logic vanish completely.
 */
export default async function PharmacyPosPage() {
  const { t, locale } = await getT();
  const ctx = await requireAnyPermission(['sales.sell', 'sales.collect']);
  if (!ctx.companyId) redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: branches }, { data: customers }, flags] = await Promise.all([
    supabase.from('erp_branches').select('id, name, name_ar').eq('is_active', true).order('code'),
    supabase.from('erp_customers').select('id, name, name_ar').eq('is_active', true).order('name').limit(200),
    getFeatureFlags(supabase, ctx.companyId),
  ]);

  const features: PosFeatureFlags = {
    barcodeScan: flags['pharmacy.pos_barcode_scan'] === true || flags['platform.scan_barcode'] === true,
    scanCamera: flags['platform.scan_camera'] === true,
    batchTracking: flags['pharmacy.batch_tracking'] === true,
    fefo: flags['pharmacy.fefo_allocation'] === true,
    holdResume: flags['pharmacy.pos_hold_resume'] === true,
    returns: flags['pharmacy.pos_returns'] === true,
    receiptPrinting: flags['pharmacy.pos_receipt_printing'] === true,
    discountApproval: flags['pharmacy.pos_discount_approval'] === true,
    substitutes: flags['pharmacy.substitute_suggestions'] === true,
    prescriptionCapture: flags['pharmacy.prescription_capture'] === true,
    prescriptionRequired: flags['pharmacy.pos_prescription_required'] === true,
    controlledTracking: flags['pharmacy.controlled_drug_tracking'] === true,
    offlinePos: flags['pharmacy.offline_pos'] === true,
    batchAwareReturns: flags['pharmacy.batch_aware_returns'] === true,
  };
  const canLink = (ctx.permissions as string[]).includes('inventory.adjust')
    || (ctx.permissions as string[]).includes('pricing.manage');
  // Platform Contact Model: inline quick-create allowed when both tenant flags are
  // on AND the role may create customers (sellers / customer managers).
  const perms2 = ctx.permissions as string[];
  const quickCreate = flags['platform.quick_customer_create'] === true
    && flags['platform.lightweight_customer_mode'] === true
    && (perms2.includes('customers.manage') || perms2.includes('sales.sell') || perms2.includes('sales.collect') || ctx.isSuperAdmin);
  // Discount is allowed for pricing managers; otherwise hidden (discount permission).
  const canDiscount = (ctx.permissions as string[]).includes('pricing.manage')
    || (ctx.permissions as string[]).includes('sales.discount');

  // Default "Cash customer" for walk-in sales: prefer one named cash/walk-in/نقدي,
  // else the first — so the cashier never has to pick a customer.
  const custList = (customers as Array<{ id: string; name: string; name_ar: string | null }>) ?? [];
  const cashCust = custList.find((c) =>
    /cash|walk|نقد|عميل نقدي/i.test(`${c.name} ${c.name_ar ?? ''}`));
  const defaultCustomerId = cashCust?.id ?? custList[0]?.id ?? '';

  return (
    <div>
      <PageHeader title={t('pharmacyPos.title')} description={t('pharmacyPos.description')} />
      <PharmacyPos
        branches={(branches as Pick<Branch, 'id' | 'name' | 'name_ar'>[]) ?? []}
        customers={(customers as Pick<ErpCustomer, 'id' | 'name' | 'name_ar'>[]) ?? []}
        features={features}
        canDiscount={canDiscount}
        canLink={canLink}
        quickCreate={quickCreate}
        intlLocale={INTL_LOCALE[locale]}
        defaultCustomerId={defaultCustomerId}
      />
    </div>
  );
}
