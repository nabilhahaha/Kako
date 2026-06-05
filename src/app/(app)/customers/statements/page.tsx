import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { StatementSearch, type StmtRow } from '@/components/shared/statement-search';

export default async function CustomerStatementsPage() {
  await requireAnyPermission(['customers.manage', 'fashion.sell', 'fashion.installments']);
  const { t } = await getT();
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_customers')
    .select('id, code, name, name_ar, phone, balance')
    .eq('is_active', true)
    .order('name')
    .limit(2000);

  return (
    <div>
      <PageHeader title={t('customers.statementsTitle')} description={t('customers.statementsDescription')} />
      <StatementSearch
        rows={(data as StmtRow[]) ?? []}
        statementBase="/customers"
        printBase="/print/statement"
        balanceLabel={t('customers.stmtSummaryBalance')}
      />
    </div>
  );
}
