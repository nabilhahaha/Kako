import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getT } from '@/lib/i18n/server';
import { MonthNav } from '../month-nav';
import { TXN_OUTCOMES, NON_TXN_OUTCOMES, NO_SALE_REASONS, type VisitOutcomeKind } from '@/lib/van-sales/visit-outcome';
import { ClipboardCheck, ShoppingCart, Ban, UserX } from 'lucide-react';

// Supervisor Visit Outcomes — the read side of the "every visit has a measurable
// outcome" rule. Outcomes are written per visit into erp_visit_outcomes (company-
// scoped RLS); this report aggregates them per rep + lists the detail so a
// supervisor can see productive vs empty visits and the reasons given. Gated by
// reports.view inside the distribution section (module-gated upstream).

const BADGE: Record<VisitOutcomeKind, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  new_sale: 'success',
  collection: 'success',
  return: 'info',
  no_sale: 'warning',
  customer_closed: 'destructive',
  not_available: 'warning',
  gps_exception: 'destructive',
  other: 'secondary',
};

const TXN = new Set<string>(TXN_OUTCOMES);
const UNPRODUCTIVE = new Set<string>(NON_TXN_OUTCOMES.filter((o) => o !== 'no_sale'));

interface Rep { id: string; full_name: string | null; email: string | null }
interface OutcomeRow {
  id: string; salesman_id: string; customer_id: string;
  visit_date: string; outcome: VisitOutcomeKind; reason: string | null; note: string | null;
}

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default async function VisitOutcomesReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission('reports.view');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];

  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('distribution.voTitle')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('distribution.noCompany')}</p>
      </div>
    );
  }

  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month || '') ? sp.month! : currentMonth();
  const start = new Date(`${month}-01T00:00:00`);
  const next = new Date(start); next.setMonth(next.getMonth() + 1);
  const startDate = `${month}-01`;
  const nextDate = next.toISOString().slice(0, 10);

  const supabase = await createClient();
  const [{ data: outcomesData }, { data: reps }] = await Promise.all([
    supabase
      .from('erp_visit_outcomes')
      .select('id, salesman_id, customer_id, visit_date, outcome, reason, note')
      .gte('visit_date', startDate)
      .lt('visit_date', nextDate)
      .order('visit_date', { ascending: false })
      .limit(1000),
    supabase.rpc('erp_company_reps'),
  ]);

  const outcomes = (outcomesData as OutcomeRow[]) ?? [];

  // Resolve the customers referenced (one scoped query, locale-aware names).
  const custIds = Array.from(new Set(outcomes.map((o) => o.customer_id)));
  const custMap = new Map<string, string>();
  if (custIds.length > 0) {
    const { data: custs } = await supabase
      .from('erp_customers')
      .select('id, name, name_ar')
      .in('id', custIds);
    for (const c of (custs as { id: string; name: string; name_ar: string | null }[]) ?? []) {
      custMap.set(c.id, locale === 'ar' ? c.name_ar || c.name : c.name);
    }
  }

  const repMap = new Map(((reps as Rep[]) ?? []).map((r) => [r.id, r.full_name || r.email || t('distribution.defaultRepName')]));

  // Totals + per-rep breakdown.
  let totProductive = 0, totNoSale = 0, totUnproductive = 0;
  const byRep = new Map<string, { total: number; productive: number; noSale: number; unproductive: number }>();
  for (const o of outcomes) {
    const bucket: 'productive' | 'noSale' | 'unproductive' = TXN.has(o.outcome) ? 'productive' : o.outcome === 'no_sale' ? 'noSale' : 'unproductive';
    if (bucket === 'productive') totProductive++; else if (bucket === 'noSale') totNoSale++; else totUnproductive++;
    const r = byRep.get(o.salesman_id) ?? { total: 0, productive: 0, noSale: 0, unproductive: 0 };
    r.total++; r[bucket]++;
    byRep.set(o.salesman_id, r);
  }
  const repRows = Array.from(byRep.entries())
    .map(([id, v]) => ({ id, name: repMap.get(id) || t('distribution.defaultRepName'), ...v }))
    .sort((a, b) => b.total - a.total);

  // Reason + note text for a row. A no-sale reason is a structured code → localize
  // it; legacy free-text reasons render as-is; the note is appended when present.
  const reasonSet = new Set<string>(NO_SALE_REASONS);
  const reasonText = (o: OutcomeRow): string => {
    const parts: string[] = [];
    if (o.reason && reasonSet.has(o.reason)) parts.push(t(`vanSales.outcome.reason_${o.reason}`));
    else if (o.reason && o.reason !== o.outcome) parts.push(o.reason);
    if (o.note) parts.push(o.note);
    return parts.join(' — ') || '—';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('distribution.voTitle')}
        description={t('distribution.voDescription')}
        action={<MonthNav month={month} base="/distribution/visit-outcomes" />}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('distribution.voTotalVisits')} value={String(outcomes.length)} icon={ClipboardCheck} tone="primary" />
        <StatCard label={t('distribution.voProductive')} value={String(totProductive)} icon={ShoppingCart} tone="success" />
        <StatCard label={t('distribution.voNoSale')} value={String(totNoSale)} icon={Ban} tone="warning" />
        <StatCard label={t('distribution.voUnproductive')} value={String(totUnproductive)} icon={UserX} tone="destructive" />
      </div>

      {/* Per-rep breakdown */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t('distribution.voByRep')}</h2>
        <Card><CardContent className="p-0">
          {repRows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('distribution.voEmpty')}</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
                <th className="p-3 text-start font-medium">{t('distribution.voColRep')}</th>
                <th className="p-3 text-center font-medium">{t('distribution.voColTotal')}</th>
                <th className="p-3 text-center font-medium">{t('distribution.voProductive')}</th>
                <th className="p-3 text-center font-medium">{t('distribution.voNoSale')}</th>
                <th className="p-3 text-center font-medium">{t('distribution.voUnproductive')}</th>
              </tr></thead>
              <tbody>
                {repRows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 text-center tabular-nums">{r.total}</td>
                    <td className="p-3 text-center tabular-nums text-success">{r.productive}</td>
                    <td className="p-3 text-center tabular-nums text-warning">{r.noSale}</td>
                    <td className="p-3 text-center tabular-nums text-destructive">{r.unproductive}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent></Card>
      </div>

      {/* Detail — recent visits with their recorded outcome + reason. */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t('distribution.voDetail')}</h2>
        <Card><CardContent className="p-0">
          {outcomes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('distribution.voEmpty')}</p>
          ) : (
            <>
              {/* Mobile: stacked cards. */}
              <ul className="divide-y sm:hidden">
                {outcomes.map((o) => (
                  <li key={o.id} className="space-y-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{custMap.get(o.customer_id) || '—'}</span>
                      <Badge variant={BADGE[o.outcome]} className="shrink-0">{t(`vanSales.outcome.o_${o.outcome}`)}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{repMap.get(o.salesman_id) || '—'}</span>
                      <span dir="ltr">{formatDate(o.visit_date, intl)}</span>
                    </div>
                    {reasonText(o) !== '—' && (
                      <p className="text-xs text-muted-foreground">{reasonText(o)}</p>
                    )}
                  </li>
                ))}
              </ul>
              {/* Desktop: table. */}
              <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
                  <th className="p-3 text-start font-medium">{t('distribution.voColDate')}</th>
                  <th className="p-3 text-start font-medium">{t('distribution.voColRep')}</th>
                  <th className="p-3 text-start font-medium">{t('distribution.voColCustomer')}</th>
                  <th className="p-3 text-center font-medium">{t('distribution.voColOutcome')}</th>
                  <th className="p-3 text-start font-medium">{t('distribution.voColReason')}</th>
                </tr></thead>
                <tbody>
                  {outcomes.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="p-3 text-muted-foreground" dir="ltr">{formatDate(o.visit_date, intl)}</td>
                      <td className="p-3">{repMap.get(o.salesman_id) || '—'}</td>
                      <td className="p-3">{custMap.get(o.customer_id) || '—'}</td>
                      <td className="p-3 text-center"><Badge variant={BADGE[o.outcome]}>{t(`vanSales.outcome.o_${o.outcome}`)}</Badge></td>
                      <td className="p-3 text-muted-foreground">{reasonText(o)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
