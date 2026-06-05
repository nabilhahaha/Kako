import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import type { Company } from '@/lib/erp/types';
import { StoreForm } from './store-form';

export default async function StoreInfoPage() {
  // Retail Store Information — store owner / admin. (Not a platform/admin page.)
  const ctx = await requireAnyPermission(['settings.users', 'settings.branches', 'fashion.manage']);
  const { t } = await getT();

  const supabase = await createClient();
  const { data } = ctx.companyId
    ? await supabase.from('erp_companies').select('*').eq('id', ctx.companyId).maybeSingle()
    : { data: null };

  return (
    <div>
      <PageHeader title={t('settings.store.title')} description={t('settings.store.description')} />
      <StoreForm company={(data as Company) ?? null} />
    </div>
  );
}
