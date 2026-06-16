import { redirect, notFound } from 'next/navigation';
import { requirePermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { dailySummaryEnabled } from '@/lib/van-sales/sell';
import { computeDailySummary, rankSalesmen, type SalesmanDay, type OutcomeEvent, type RankKey } from '@/lib/van-sales/daily-summary';
import type { VisitOutcomeKind } from '@/lib/van-sales/visit-outcome';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
const ACTIVE_INV = ['issued', 'paid', 'partially_paid', 'overdue'];
const LONG_IDLE_MIN = 90; // estimated-idle highlight threshold

interface Rep { id: string; full_name: string | null; email: string | null }

// Supervisor Daily Summary (Phase 1) — per-salesman KPIs for today + rankings,
// read-only from existing data. Live for open days, final for closed. Estimated
// (gap-based) idle is tagged تقديري; true durations/productive hours = Phase 2.
export default async function SupervisorDailySummaryPage() {
  await requirePermission('reports.view');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const money = (n: number) => formatCurrency(n, 'EGP', intl);

  if (!ctx.companyId) {
    return (<div><PageHeader title={t('vanSales.dailySummary.supervisorTitle')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('distribution.noCompany')}</p></div>);
  }
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (!dailySummaryEnabled(flags)) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const dayStart = `${today}T00:00:00`;
  const nowIso = new Date().toISOString();

  const [{ data: reps }, { data: sessions }, { data: outcomeRows }, { data: invRows }, { data: collRows }, { data: retRows }] = await Promise.all([
    supabase.rpc('erp_company_reps'),
    supabase.from('erp_work_sessions').select('salesman_id, opened_at, closed_at').eq('work_date', today),
    supabase.from('erp_visit_outcomes').select('salesman_id, outcome, customer_id, created_at').eq('visit_date', today),
    supabase.from('erp_invoices').select('created_by, net_amount, created_at').in('status', ACTIVE_INV).gte('created_at', dayStart),
    supabase.from('erp_collections').select('received_by, amount, created_at').gte('created_at', dayStart),
    supabase.from('erp_sales_returns').select('created_by, created_at').gte('created_at', dayStart),
  ]);

  const repMap = new Map(((reps as Rep[]) ?? []).map((r) => [r.id, r.full_name || r.email || t('distribution.defaultRepName')]));
  const sessionMap = new Map(((sessions as { salesman_id: string; opened_at: string | null; closed_at: string | null }[]) ?? []).map((s) => [s.salesman_id, s]));

  // Group activity by salesman.
  type Bucket = { outcomes: OutcomeEvent[]; invoices: { amount: number; at: string }[]; collections: { amount: number; at: string }[]; returns: { at: string }[] };
  const buckets = new Map<string, Bucket>();
  const bucket = (id: string | null): Bucket | null => {
    if (!id) return null;
    let b = buckets.get(id);
    if (!b) { b = { outcomes: [], invoices: [], collections: [], returns: [] }; buckets.set(id, b); }
    return b;
  };
  for (const o of (outcomeRows as { salesman_id: string; outcome: string; customer_id: string; created_at: string }[]) ?? [])
    bucket(o.salesman_id)?.outcomes.push({ kind: o.outcome as VisitOutcomeKind, customerId: o.customer_id, at: o.created_at });
  for (const i of (invRows as { created_by: string | null; net_amount: number; created_at: string }[]) ?? [])
    bucket(i.created_by)?.invoices.push({ amount: Number(i.net_amount ?? 0), at: i.created_at });
  for (const c of (collRows as { received_by: string | null; amount: number; created_at: string }[]) ?? [])
    bucket(c.received_by)?.collections.push({ amount: Number(c.amount ?? 0), at: c.created_at });
  for (const r of (retRows as { created_by: string | null; created_at: string }[]) ?? [])
    bucket(r.created_by)?.returns.push({ at: r.created_at });

  // Every salesman with a session today OR any activity gets a row.
  const ids = new Set<string>([...sessionMap.keys(), ...buckets.keys()]);
  const rows: SalesmanDay[] = Array.from(ids).map((id) => {
    const b = buckets.get(id) ?? { outcomes: [], invoices: [], collections: [], returns: [] };
    const sess = sessionMap.get(id);
    return {
      salesmanId: id,
      name: repMap.get(id) || t('distribution.defaultRepName'),
      summary: computeDailySummary({ dayOpenedAt: sess?.opened_at ?? null, dayClosedAt: sess?.closed_at ?? null, nowIso, ...b }),
    };
  }).sort((a, b) => b.summary.salesAmount - a.summary.salesAmount);

  const rankCards: { key: RankKey; title: string; fmt: (s: SalesmanDay) => string }[] = [
    { key: 'salesAmount', title: t('vanSales.dailySummary.rankSales'), fmt: (r) => money(r.summary.salesAmount) },
    { key: 'collectionAmount', title: t('vanSales.dailySummary.rankCollections'), fmt: (r) => money(r.summary.collectionAmount) },
    { key: 'visits', title: t('vanSales.dailySummary.rankVisits'), fmt: (r) => String(r.summary.visits) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.dailySummary.supervisorTitle')} description={t('vanSales.dailySummary.supervisorSubtitle')} />

      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('vanSales.dailySummary.empty')}</CardContent></Card>
      ) : (
        <>
          {/* Rankings */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {rankCards.map((rc) => (
              <Card key={rc.key}>
                <CardContent className="p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">{rc.title}</p>
                  <ol className="space-y-1">
                    {rankSalesmen(rows, rc.key).slice(0, 5).map((r, i) => (
                      <li key={r.salesmanId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate"><span className="text-muted-foreground">{i + 1}.</span> {r.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums" dir="ltr">{rc.fmt(r)}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Per-salesman table */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t('vanSales.dailySummary.bySalesman')}</h2>
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
                  <th className="p-3 text-start font-medium">{t('vanSales.dailySummary.colSalesman')}</th>
                  <th className="p-3 text-center font-medium">{t('vanSales.dailySummary.colStatus')}</th>
                  <th className="p-3 text-center font-medium">{t('vanSales.dailySummary.colVisits')}</th>
                  <th className="p-3 text-center font-medium">{t('vanSales.dailySummary.colCustomers')}</th>
                  <th className="p-3 text-center font-medium">{t('vanSales.dailySummary.colSales')}</th>
                  <th className="p-3 text-center font-medium">{t('vanSales.dailySummary.colCollections')}</th>
                  <th className="p-3 text-center font-medium">{t('vanSales.dailySummary.colNoSale')}</th>
                  <th className="p-3 text-center font-medium">{t('vanSales.dailySummary.colIdle')}</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const sm = r.summary;
                    const longIdle = sm.longestGapMinutes != null && sm.longestGapMinutes >= LONG_IDLE_MIN;
                    return (
                      <tr key={r.salesmanId} className="border-b last:border-0">
                        <td className="p-3 font-medium">
                          {r.name}
                          <span className="ms-1 inline-flex flex-wrap gap-1 align-middle">
                            {sm.noSaleRepeatCustomers > 0 && <Badge variant="destructive" className="text-[10px]">{t('vanSales.dailySummary.flagRepeatNoSale')}</Badge>}
                            {longIdle && <Badge variant="warning" className="text-[10px]">{t('vanSales.dailySummary.flagLongIdle')}</Badge>}
                          </span>
                        </td>
                        <td className="p-3 text-center"><Badge variant={sm.open ? 'success' : 'secondary'}>{sm.open ? t('vanSales.dailySummary.live') : t('vanSales.dailySummary.final')}</Badge></td>
                        <td className="p-3 text-center tabular-nums">{sm.visits}</td>
                        <td className="p-3 text-center tabular-nums">{sm.customersVisited}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">{money(sm.salesAmount)}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">{money(sm.collectionAmount)}</td>
                        <td className="p-3 text-center tabular-nums">{sm.noSaleVisits}</td>
                        <td className="p-3 text-center tabular-nums text-muted-foreground" dir="ltr">{sm.longestGapMinutes != null ? `${sm.longestGapMinutes} ${t('vanSales.dailySummary.minutes')}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </CardContent></Card>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <span className="rounded bg-warning/15 px-1.5 py-0.5 font-bold text-warning">{t('vanSales.dailySummary.estimatedTag')}</span> {t('vanSales.dailySummary.phase2Note')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
