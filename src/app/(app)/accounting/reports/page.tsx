import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { ACCOUNT_TYPE_LABELS } from '@/lib/erp/constants';
import type { AccountType } from '@/lib/erp/types';

interface LineAgg {
  account_id: string;
  debit: number;
  credit: number;
  account: {
    code: string;
    name: string;
    name_ar: string | null;
    account_type: AccountType;
  } | null;
}

interface AccountRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export default async function ReportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  // Only posted entries contribute to the trial balance.
  const { data: postedEntries } = await supabase
    .from('erp_journal_entries')
    .select('id')
    .eq('status', 'posted');
  const postedIds = new Set((postedEntries ?? []).map((e) => e.id));

  const { data } = await supabase
    .from('erp_journal_lines')
    .select(
      'account_id, debit, credit, journal_entry_id, account:erp_chart_of_accounts(code, name, name_ar, account_type)',
    );

  const lines = ((data as unknown as (LineAgg & { journal_entry_id: string })[]) ?? []).filter((l) =>
    postedIds.has(l.journal_entry_id),
  );

  const byAccount = new Map<string, AccountRow>();
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

  const rows = [...byAccount.values()]
    .map((r) => {
      const net = r.debit - r.credit;
      return { ...r, debitBal: net > 0 ? net : 0, creditBal: net < 0 ? -net : 0 };
    })
    .filter((r) => r.debitBal > 0.001 || r.creditBal > 0.001)
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalDebit = rows.reduce((s, r) => s + r.debitBal, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditBal, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div>
      <PageHeader
        title="ميزان المراجعة"
        description="أرصدة الحسابات المرحّلة (من القيود المرحّلة فقط)"
      />
      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا توجد قيود مرحّلة بعد لعرض ميزان المراجعة.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">الحساب</th>
                    <th className="p-3 text-right font-medium">النوع</th>
                    <th className="p-3 text-left font-medium">مدين</th>
                    <th className="p-3 text-left font-medium">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3">
                        <span className="me-2 font-mono text-xs text-muted-foreground" dir="ltr">{r.code}</span>
                        {r.name}
                      </td>
                      <td className="p-3 text-muted-foreground">{ACCOUNT_TYPE_LABELS[r.type].ar}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{r.debitBal > 0 ? formatCurrency(r.debitBal) : '—'}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{r.creditBal > 0 ? formatCurrency(r.creditBal) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-bold">
                  <tr>
                    <td className="p-3" colSpan={2}>الإجمالي</td>
                    <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalDebit)}</td>
                    <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="border-t p-3 text-sm">
              {balanced ? (
                <span className="text-success">✓ الميزان متوازن (المدين = الدائن)</span>
              ) : (
                <span className="text-destructive">
                  ⚠ الميزان غير متوازن — الفرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
