import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Pager } from '@/components/pager';
import { JournalList, type JournalEntryRow } from './journal-list';

const PAGE_SIZE = 25;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const fromIdx = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data, count } = await supabase
    .from('erp_journal_entries')
    .select(
      '*, lines:erp_journal_lines(*, account:erp_chart_of_accounts(code, name, name_ar))',
      { count: 'exact' },
    )
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(fromIdx, fromIdx + PAGE_SIZE - 1);

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
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/accounting/journal" />
    </div>
  );
}
