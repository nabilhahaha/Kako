import { requireAnyPermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { BackupManager, type StoredBackup } from './backup-manager';

export default async function BackupPage() {
  await requireAnyPermission(['settings.users', 'fashion.manage', 'fashion.reports']);
  const ctx = await getUserContext();
  const { t } = await getT();

  const supabase = await createClient();
  const count = async (table: string) => (await supabase.from(table).select('id', { count: 'exact', head: true })).count ?? 0;
  const [products, customers, invoices, { data: settings }, { data: backups }] = await Promise.all([
    count('erp_products_catalog'), count('erp_customers'), count('erp_invoices'),
    ctx?.companyId
      ? supabase.from('erp_ops_settings').select('backup_frequency, backup_retention, last_backup_at').eq('company_id', ctx.companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('erp_backups').select('id, kind, created_at, record_counts').order('created_at', { ascending: false }).limit(20),
  ]);

  const s = settings as { backup_frequency?: string; backup_retention?: number; last_backup_at?: string | null } | null;

  return (
    <div>
      <PageHeader title={t('settings.backup.title')} description={t('settings.backup.description')} />
      <BackupManager
        counts={{ products, customers, invoices }}
        frequency={(s?.backup_frequency as 'off' | 'daily' | 'weekly') ?? 'off'}
        retention={s?.backup_retention ?? 7}
        lastBackupAt={s?.last_backup_at ?? null}
        backups={(backups as StoredBackup[]) ?? []}
      />
    </div>
  );
}
