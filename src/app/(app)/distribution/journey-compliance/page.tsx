import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** ── Journey Compliance Report ─────────────────────────────────────────────
 *  Read-only, paginated. Server-renders one row per salesman/date from
 *  erp_work_sessions: planned, visited, skipped, coverage %, GPS-violation and
 *  out-of-route counts, and close status. RLS scopes rows to the caller. */

const PAGE_SIZE = 25;

interface SessionRow {
  id: string;
  salesman_id: string;
  work_date: string;
  planned_count: number | null;
  visited_count: number | null;
  skipped_count: number | null;
  coverage_pct: number | null;
  gps_violation_count: number | null;
  out_of_route_count: number | null;
  close_status: string | null;
}

export default async function JourneyCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission('reports.view');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: rows, count } = await supabase
    .from('erp_work_sessions')
    .select(
      'id, salesman_id, work_date, planned_count, visited_count, skipped_count, coverage_pct, gps_violation_count, out_of_route_count, close_status',
      { count: 'exact' },
    )
    .order('work_date', { ascending: false })
    .range(from, to);

  const sessions = (rows as SessionRow[]) ?? [];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Resolve salesman display names (no raw UUIDs).
  const ids = [...new Set(sessions.map((s) => s.salesman_id))];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from('erp_profiles')
      .select('id, full_name, email')
      .in('id', ids);
    for (const p of (profiles as { id: string; full_name: string | null; email: string | null }[]) ?? []) {
      nameById.set(p.id, p.full_name || p.email || '—');
    }
  }

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString(INTL_LOCALE[locale], { year: 'numeric', month: 'short', day: 'numeric' });

  const closeBadge = (status: string | null) => {
    switch (status) {
      case 'closed':
        return <Badge variant="success">{t('fmcg.closeClosed')}</Badge>;
      case 'pending_approval':
        return <Badge variant="warning">{t('fmcg.closePending')}</Badge>;
      default:
        return <Badge variant="secondary">{t('fmcg.closeOpen')}</Badge>;
    }
  };

  const Prev = locale === 'ar' ? ChevronRight : ChevronLeft;
  const Next = locale === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <div>
      <PageHeader title={t('fmcg.complianceTitle')} description={t('fmcg.complianceDescription')} />
      <Card>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('fmcg.complianceEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('fmcg.colSalesman')}</th>
                    <th className="p-3 text-start font-medium">{t('fmcg.colDate')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.colPlanned')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.colVisited')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.colSkipped')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.colCoverage')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.colGpsViolations')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.colOutOfRoute')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcg.colCloseStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const cov = s.coverage_pct ?? 0;
                    return (
                      <tr key={s.id} className="border-b">
                        <td className="p-3 font-medium">{nameById.get(s.salesman_id) || '—'}</td>
                        <td className="p-3 text-muted-foreground" dir="ltr">{fmtDate(s.work_date)}</td>
                        <td className="p-3 text-center tabular-nums">{s.planned_count ?? '—'}</td>
                        <td className="p-3 text-center tabular-nums">{s.visited_count ?? '—'}</td>
                        <td className="p-3 text-center tabular-nums">{s.skipped_count ?? '—'}</td>
                        <td className="p-3 text-center">
                          {s.coverage_pct == null ? (
                            '—'
                          ) : (
                            <Badge variant={cov >= 80 ? 'success' : cov >= 50 ? 'warning' : 'secondary'}>{cov}%</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center tabular-nums">
                          {s.gps_violation_count ? (
                            <span className="text-destructive">{s.gps_violation_count}</span>
                          ) : (
                            (s.gps_violation_count ?? 0)
                          )}
                        </td>
                        <td className="p-3 text-center tabular-nums">
                          {s.out_of_route_count ? (
                            <span className="text-warning">{s.out_of_route_count}</span>
                          ) : (
                            (s.out_of_route_count ?? 0)
                          )}
                        </td>
                        <td className="p-3 text-center">{closeBadge(s.close_status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link
            href={`/distribution/journey-compliance?page=${page - 1}`}
            className={`inline-flex min-w-24 items-center justify-center gap-1 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-secondary ${
              page <= 1 ? 'pointer-events-none opacity-50' : ''
            }`}
            aria-disabled={page <= 1}
          >
            <Prev className="h-4 w-4" /> {t('platform.pagination.prev')}
          </Link>
          <span className="text-sm text-muted-foreground">
            {t('platform.pagination.pageOf', { page, pages: pageCount })} · {total}
          </span>
          <Link
            href={`/distribution/journey-compliance?page=${page + 1}`}
            className={`inline-flex min-w-24 items-center justify-center gap-1 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-secondary ${
              page >= pageCount ? 'pointer-events-none opacity-50' : ''
            }`}
            aria-disabled={page >= pageCount}
          >
            {t('platform.pagination.next')} <Next className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
