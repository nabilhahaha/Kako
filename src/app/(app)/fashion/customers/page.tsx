import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requireAnyPermission } from '@/lib/erp/guards';
import { CustomersManager } from './customers-manager';

export default async function FashionCustomersPage() {
  const { t, locale } = await getT();
  await requireAnyPermission(['fashion.sell', 'fashion.installments']);
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.customers.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }
  const supabase = await createClient();
  const { data } = await supabase.from('erp_customers').select('id, name, phone, balance').neq('code', 'WALKIN').order('name').limit(200);
  return (
    <div>
      <PageHeader title={t('fashion.customers.title')} description={t('fashion.customers.description')} />
      <CustomersManager customers={(data as never) ?? []} locale={locale} />
    </div>
  );
}
