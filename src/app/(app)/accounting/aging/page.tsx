import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';

interface InvoiceRow {
  id: string;
  customer_id: string | null;
  net_amount: number | null;
  paid_amount: number | null;
  due_date: string | null;
  created_at: string;
  customer: { name: string; name_ar: string | null } | null;
}

type Bucket = 'current' | 'd30' | 'd60' | 'd90' | 'd90p';
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'current', label: 'غير مستحق' },
  { key: 'd30', label: '١–٣٠ يوم' },
  { key: 'd60', label: '٣١–٦٠ يوم' },
  { key: 'd90', label: '٦١–٩٠ يوم' },
  { key: 'd90p', label: '+٩٠ يوم' },
];

function emptyRow(): Record<Bucket, number> {
  return { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
}

function bucketFor(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd30';
  if (daysOverdue <= 60) return 'd60';
  if (daysOverdue <= 90) return 'd90';
  return 'd90p';
}

export default async function AgingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from('erp_invoices')
    .select('id, customer_id, net_amount, paid_amount, due_date, created_at, customer:erp_customers(name, name_ar)')
    .in('status', ['issued', 'partially_paid', 'overdue']);

  const rows = (invoices as unknown as InvoiceRow[]) ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byCustomer = new Map<string, { name: string; buckets: Record<Bucket, number>; total: number }>();
  const totals = emptyRow();
  let grandTotal = 0;

  for (const inv of rows) {
    const outstanding = (inv.net_amount ?? 0) - (inv.paid_amount ?? 0);
    if (outstanding <= 0) continue;

    const ref = inv.due_date || inv.created_at;
    const refDate = new Date((ref ?? '').slice(0, 10) + 'T00:00:00');
    const daysOverdue = Math.round((today.getTime() - refDate.getTime()) / 86_400_000);
    const bucket = bucketFor(daysOverdue);

    const cid = inv.customer_id ?? 'unknown';
    let entry = byCustomer.get(cid);
    if (!entry) {
      entry = {
        name: inv.customer?.name_ar || inv.customer?.name || '—',
        buckets: emptyRow(),
        total: 0,
      };
      byCustomer.set(cid, entry);
    }
    entry.buckets[bucket] += outstanding;
    entry.total += outstanding;
    totals[bucket] += outstanding;
    grandTotal += outstanding;
  }

  const customers = [...byCustomer.values()].sort((a, b) => b.total - a.total);

  return (
    <div>
      <PageHeader
        title="أعمار ديون العملاء"
        description="إجمالي المديونية المستحقة على كل عميل موزّعة حسب عمر الدين."
      />
      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">لا توجد مديونيات مستحقة. 👍</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="sticky right-0 bg-secondary/50 p-3 text-right font-medium">العميل</th>
                    {BUCKETS.map((b) => (
                      <th key={b.key} className="p-3 text-center font-medium whitespace-nowrap">{b.label}</th>
                    ))}
                    <th className="p-3 text-center font-medium">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, i) => (
                    <tr key={i} className="border-b">
                      <td className="sticky right-0 bg-background p-3 font-medium">{c.name}</td>
                      {BUCKETS.map((b) => (
                        <td key={b.key} className="p-3 text-center tabular-nums" dir="ltr">
                          {c.buckets[b.key] ? formatNumber(Math.round(c.buckets[b.key])) : '—'}
                        </td>
                      ))}
                      <td className="p-3 text-center font-semibold tabular-nums" dir="ltr">{formatNumber(Math.round(c.total))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-secondary/30 font-semibold">
                    <td className="sticky right-0 bg-secondary/30 p-3">الإجمالي</td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className="p-3 text-center tabular-nums" dir="ltr">{formatNumber(Math.round(totals[b.key]))}</td>
                    ))}
                    <td className="p-3 text-center tabular-nums" dir="ltr">{formatNumber(Math.round(grandTotal))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
