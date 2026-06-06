import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { StatementSearch, type StmtRow } from '@/components/shared/statement-search';

export default async function SupplierStatementsPage() {
  await requireAnyPermission(['suppliers.manage', 'fashion.purchase']);
  const { t } = await getT();
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_suppliers')
    .select('id, code, name, name_ar, phone, balance')
    .eq('is_active', true)
    .order('name')
    .limit(2000);

  return (
    <div>
      <PageHeader title={t('suppliers.statementsTitle')} description={t('suppliers.statementsDescription')} />
      <StatementSearch
        rows={(data as StmtRow[]) ?? []}
        statementBase="/suppliers"
        printBase="/print/supplier-statement"
        balanceLabel={t('suppliers.stmtSummaryBalance')}
      />
    </div>
  );
}
