import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { MslManager, type MslData } from './msl-manager';

// MSL Matrix Engine — company self-management. Fully dynamic: dimensions, values,
// levels and rules are all company master data. Defensive: degrades to a clear
// empty state until the 0144 migration is applied (drift).

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function MslPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'assortment.manage')) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();

  const [levels, policies, conditions, items, lookups, products] = await Promise.all([
    safe(async () => (await supabase.from('erp_msl_levels').select('id, code, name, name_ar, weight, is_active').order('sort', { ascending: true })).data ?? [], []),
    safe(async () => (await supabase.from('erp_msl_policies').select('id, name, name_ar, priority, effective_from, effective_to, is_active').order('priority', { ascending: false })).data ?? [], []),
    safe(async () => (await supabase.from('erp_msl_policy_conditions').select('id, policy_id, lookup_id')).data ?? [], []),
    safe(async () => (await supabase.from('erp_msl_policy_items').select('id, policy_id, product_id, level_id, weight')).data ?? [], []),
    safe(async () => (await supabase.from('erp_customer_lookups').select('id, kind, name, name_ar').eq('is_active', true).order('kind', { ascending: true })).data ?? [], []),
    safe(async () => (await supabase.from('erp_products_catalog').select('id, code, name').eq('is_active', true).order('name', { ascending: true }).limit(1000)).data ?? [], []),
  ]);

  const data: MslData = {
    levels: levels as MslData['levels'],
    policies: policies as MslData['policies'],
    conditions: conditions as MslData['conditions'],
    items: items as MslData['items'],
    lookups: lookups as MslData['lookups'],
    products: products as MslData['products'],
  };
  const ready = data.lookups.length > 0 || data.policies.length > 0 || data.levels.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.msl.title')} description={t('retail.msl.subtitle')} />
      {!ready && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t('retail.msl.drift')}</CardContent></Card>
      )}
      <MslManager data={data} />
    </div>
  );
}
