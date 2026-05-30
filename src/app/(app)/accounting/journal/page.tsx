import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Pager } from '@/components/pager';
import { ListSearch } from '@/components/list-search';
import { JournalList, type JournalEntryRow } from './journal-list';

const PAGE_SIZE = 25;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').trim();
  const fromIdx = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let listQuery = supabase
    .from('erp_journal_entries')
    .select(
      '*, lines:erp_journal_lines(*, account:erp_chart_of_accounts(code, name, name_ar))',
      { count: 'exact' },
    )
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (q) listQuery = listQuery.or(`entry_number.ilike.%${q}%,description.ilike.%${q}%`);

  const { data, count } = await listQuery.range(fromIdx, fromIdx + PAGE_SIZE - 1);

  const entries = (data as JournalEntryRow[]) ?? [];

  return (
    <div>
      <PageHeader
        title="القيود اليومية"
        description="القيود المحاسبية (تتولّد تلقائياً من الفواتير والتحصيل والمشتريات)"
      />
      {entries.length === 0 && !q ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا توجد قيود بعد. أصدر فاتورة أو استلم أمر شراء لتتولّد القيود تلقائياً.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-3">
            <ListSearch placeholder="بحث برقم القيد أو الوصف…" />
          </div>
          {entries.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">لا توجد نتائج مطابقة.</CardContent>
            </Card>
          ) : (
            <JournalList entries={entries} />
          )}
        </>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/accounting/journal" query={{ q: q || undefined }} />
    </div>
  );
}
