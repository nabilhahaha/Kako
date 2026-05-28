import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { AccountType } from '@/lib/erp/types';
import { ReportsView, type AccountAgg } from './reports-view';

interface LineRow {
  debit: number;
  credit: number;
  journal_entry_id: string;
  account: {
    code: string;
    name: string;
    name_ar: string | null;
    account_type: AccountType;
  } | null;
}

export default async function ReportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data: postedEntries } = await supabase
    .from('erp_journal_entries')
    .select('id')
    .eq('status', 'posted');
  const postedIds = new Set((postedEntries ?? []).map((e) => e.id));

  const { data } = await supabase
    .from('erp_journal_lines')
    .select(
      'debit, credit, journal_entry_id, account:erp_chart_of_accounts(code, name, name_ar, account_type)',
    );

  const lines = ((data as unknown as LineRow[]) ?? []).filter((l) =>
    postedIds.has(l.journal_entry_id),
  );

  const byAccount = new Map<string, AccountAgg>();
  for (const l of lines) {
    if (!l.account) continue;
    const key = l.account.code;
    const row =
      byAccount.get(key) ??
      {
        code: l.account.code,
        name: l.account.name_ar || l.account.name,
        type: l.account.account_type,
        debit: 0,
        credit: 0,
      };
    row.debit += Number(l.debit);
    row.credit += Number(l.credit);
    byAccount.set(key, row);
  }

  return (
    <div>
      <PageHeader
        title="التقارير المالية"
        description="ميزان المراجعة وقائمة الدخل والميزانية (من القيود المرحّلة)"
      />
      <ReportsView accounts={[...byAccount.values()]} />
    </div>
  );
}
