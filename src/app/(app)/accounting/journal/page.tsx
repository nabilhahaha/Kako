import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { JournalList, type JournalEntryRow } from './journal-list';

export default async function JournalPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_journal_entries')
    .select(
      '*, lines:erp_journal_lines(*, account:erp_chart_of_accounts(code, name, name_ar))',
    )
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const entries = (data as JournalEntryRow[]) ?? [];

  return (
    <div>
      <PageHeader
        title="القيود اليومية"
        description="القيود المحاسبية (تتولّد تلقائياً من الفواتير والتحصيل والمشتريات)"
      />
      {entries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا توجد قيود بعد. أصدر فاتورة أو استلم أمر شراء لتتولّد القيود تلقائياً.
          </CardContent>
        </Card>
      ) : (
        <JournalList entries={entries} />
      )}
    </div>
  );
}
