import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { GettingStarted } from '@/components/shared/getting-started';
import { TiersManager, type Tier } from './tiers-manager';
import { getT } from '@/lib/i18n/server';

export default async function WholesaleTiersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('wholesale.tiersPageTitleNoCompany')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('wholesale.companyOnly')}</p></div>);
  }
  const supabase = await createClient();
  const [{ data }, { count: customersCount }, { count: invoicesCount }] = await Promise.all([
    supabase.from('erp_wholesale_tiers').select('id, name, sort, is_active').order('sort').order('name'),
    supabase.from('erp_customers').select('id', { count: 'exact', head: true }),
    supabase.from('erp_invoices').select('id', { count: 'exact', head: true }),
  ]);
  const tiers = (data as Tier[]) ?? [];
  return (
    <div>
      <PageHeader title={t('wholesale.tiersPageTitle')} description={t('wholesale.tiersPageDescription')} />
      <GettingStarted
        storageKey="kako_gs_wholesale"
        steps={[
          { label: t('wholesale.gsStepDefineTiers'), href: '/wholesale', done: tiers.length > 0 },
          { label: t('wholesale.gsStepAddCustomers'), href: '/wholesale/customers', done: (customersCount ?? 0) > 0 },
          { label: t('wholesale.gsStepFirstInvoice'), href: '/wholesale/order', done: (invoicesCount ?? 0) > 0 },
        ]}
      />
      <TiersManager tiers={tiers} />
    </div>
  );
}
