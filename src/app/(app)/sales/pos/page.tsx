import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ErpCustomer, ProductCatalog } from '@/lib/erp/types';
import { PosTerminal } from './pos-terminal';
import { getT } from '@/lib/i18n/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { multiUomEnabled } from '@/lib/erp/uom';
import { loadProductUnitsMany } from '@/lib/erp/uom-server';

export default async function PosPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: customers }, { data: branches }, { data: products }, flags] = await Promise.all([
    supabase.from('erp_customers').select('*').eq('is_active', true).order('name'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
    getFeatureFlags(supabase, ctx.companyId),
  ]);

  // U3: when multi-UoM is on, attach each product's sellable units for the picker.
  const multiUom = multiUomEnabled(flags);
  const productUnits: Record<string, { uom: string; factor: number }[]> = {};
  if (multiUom) {
    const list = (products as ProductCatalog[]) ?? [];
    const cfgs = await loadProductUnitsMany(supabase, list.map((p) => p.id));
    for (const p of list) {
      const cfg = cfgs.get(p.id);
      if (!cfg) continue;
      productUnits[p.id] = cfg.rules.sellMode === 'base'
        ? [{ uom: cfg.units.base, factor: 1 }]
        : cfg.units.units.map((u) => ({ uom: u.uom, factor: u.factor }));
    }
  }

  return (
    <div>
      <PageHeader title={t('sales.posTitle')} description={t('sales.posDescription')} />
      <PosTerminal
        customers={(customers as ErpCustomer[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
        receiptPrinting={flags['pharmacy.pos_receipt_printing'] === true}
        productUnits={productUnits}
        multiUom={multiUom}
      />
    </div>
  );
}
