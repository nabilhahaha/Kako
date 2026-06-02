import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import type {
  Area, Branch, CustomerLookup, ErpCustomer, PriceChangeLogEntry, PriceList, PriceListItem,
  PriceRule, ProductCatalog, Region,
} from '@/lib/erp/types';
import { PricingManager } from './pricing-manager';

export default async function PricingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!hasPermission(ctx, 'pricing.manage')) {
    return (
      <div>
        <PageHeader title={t('pricing.pageTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('pricing.noAccess')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [
    { data: rules }, { data: lists }, { data: items }, { data: products },
    { data: customers }, { data: lookups }, { data: tiers },
    { data: branches }, { data: regions }, { data: areas }, { data: history },
  ] = await Promise.all([
    supabase.from('erp_price_rules').select('*').order('created_at', { ascending: false }),
    supabase.from('erp_price_lists').select('*').order('name'),
    supabase.from('erp_price_list_items').select('*'),
    supabase.from('erp_products_catalog').select('id, code, name, name_ar').eq('is_active', true).order('code'),
    supabase.from('erp_customers').select('id, name, name_ar').eq('is_active', true).order('name'),
    supabase.from('erp_customer_lookups').select('*').eq('is_active', true).in('kind', ['segment', 'channel']),
    supabase.from('erp_wholesale_tiers').select('id, name').eq('is_active', true).order('sort'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_regions').select('*').eq('is_active', true).order('name'),
    supabase.from('erp_areas').select('*').eq('is_active', true).order('name'),
    supabase.from('erp_price_change_log').select('*').order('changed_at', { ascending: false }).limit(100),
  ]);

  return (
    <div>
      <PageHeader title={t('pricing.pageTitle')} description={t('pricing.pageDescription')} />
      <PricingManager
        rules={(rules as PriceRule[]) ?? []}
        lists={(lists as PriceList[]) ?? []}
        items={(items as PriceListItem[]) ?? []}
        products={(products as Pick<ProductCatalog, 'id' | 'code' | 'name' | 'name_ar'>[]) ?? []}
        customers={(customers as Pick<ErpCustomer, 'id' | 'name' | 'name_ar'>[]) ?? []}
        lookups={(lookups as CustomerLookup[]) ?? []}
        tiers={(tiers as { id: string; name: string }[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        regions={(regions as Region[]) ?? []}
        areas={(areas as Area[]) ?? []}
        history={(history as PriceChangeLogEntry[]) ?? []}
      />
    </div>
  );
}
