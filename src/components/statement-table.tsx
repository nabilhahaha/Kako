import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';

export interface StatementEntry {
  date: string;
  ref: string;
  description: string;
  /** Increases the balance owed (e.g. invoice to customer, goods received from supplier). */
  debit: number;
  /** Decreases the balance owed (e.g. payment). */
  credit: number;
}

/**
 * Renders a running-balance statement. `debit` raises the balance and `credit`
 * lowers it, so the closing balance equals total debit − total credit.
 */
export function StatementTable({
  entries,
  debitLabel,
  creditLabel,
  emptyText = 'لا توجد حركات.',
}: {
  entries: StatementEntry[];
  debitLabel: string;
  creditLabel: string;
  emptyText?: string;
}) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  let running = 0;
  const rows = sorted.map((e) => {
    running += Number(e.debit) - Number(e.credit);
    return { ...e, balance: running };
  });
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">{emptyText}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-right font-medium">التاريخ</th>
                <th className="p-3 text-right font-medium">المرجع</th>
                <th className="p-3 text-right font-medium">البيان</th>
                <th className="p-3 text-left font-medium">{debitLabel}</th>
                <th className="p-3 text-left font-medium">{creditLabel}</th>
                <th className="p-3 text-left font-medium">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-secondary/30">
                  <td className="p-3 text-muted-foreground">{formatDate(r.date)}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{r.ref}</td>
                  <td className="p-3">{r.description}</td>
                  <td className="p-3 text-left tabular-nums" dir="ltr">{Number(r.debit) > 0 ? formatCurrency(r.debit) : '—'}</td>
                  <td className="p-3 text-left tabular-nums text-success" dir="ltr">{Number(r.credit) > 0 ? formatCurrency(r.credit) : '—'}</td>
                  <td className="p-3 text-left font-medium tabular-nums" dir="ltr">{formatCurrency(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 font-bold">
              <tr>
                <td className="p-3" colSpan={3}>الإجمالي</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalDebit)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalCredit)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalDebit - totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
