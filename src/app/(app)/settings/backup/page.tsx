import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { BackupPanel } from './backup-panel';

export default async function BackupPage() {
  await requireAnyPermission(['settings.users', 'fashion.manage', 'fashion.reports']);
  const { t } = await getT();

  const supabase = await createClient();
  const count = async (table: string) => (await supabase.from(table).select('id', { count: 'exact', head: true })).count ?? 0;
  const [products, customers, invoices] = await Promise.all([
    count('erp_products_catalog'), count('erp_customers'), count('erp_invoices'),
  ]);

  return (
    <div>
      <PageHeader title={t('settings.backup.title')} description={t('settings.backup.description')} />
      <BackupPanel counts={{ products, customers, invoices }} />
    </div>
  );
}
