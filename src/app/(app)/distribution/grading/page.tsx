import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Star, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loadRetailExecData } from '@/lib/erp/retail-exec-data';
import { distributionByDimension, type OutletForKpi, type DimensionRow } from '@/lib/erp/distribution-kpi';
import { EmptyCard } from '../_retail/ui';

type Row = Record<string, unknown>;
const sx = (v: unknown) => (v == null ? '' : String(v));
async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function GradingDashboard() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');
  const { t, locale } = await getT();
  const supabase = await createClient();
  const data = await loadRetailExecData(supabase, { locale });

  const bands = await safe(async () => (await supabase.from('erp_outlet_grades').select('id, code, name, name_ar, rank').order('rank', { ascending: false })).data ?? [], [] as Row[]);
  const histR = await safe(async () => (await supabase.from('erp_outlet_grade_history').select('customer_id, movement, computed_at').order('computed_at', { ascending: false }).limit(10000)).data ?? [], [] as Row[]);

  // Aggregate per grade from the shared metrics (dims.grade).
  const count = new Map<string, number>(); const sales = new Map<string, number>();
  const kpiByGrade = new Map<string, OutletForKpi[]>();
  for (const m of data.metrics) {
    const g = m.dims.grade; if (!g?.id) continue;
    count.set(g.id, (count.get(g.id) ?? 0) + 1);
    sales.set(g.id, (sales.get(g.id) ?? 0) + m.value);
    const o: OutletForKpi = { customerId: m.customerId, weight: m.value || 1, soldProductIds: data.soldByCustomer.get(m.customerId) ?? new Set<string>() };
    (kpiByGrade.get(g.id) ?? kpiByGrade.set(g.id, []).get(g.id)!).push(o);
  }
  const distRows: DimensionRow[] = [...kpiByGrade.entries()].map(([id, outlets]) => ({ key: id, label: id, outlets }));
  const distByGrade = new Map(distributionByDimension(data.productUniverse, distRows).map((d) => [d.key, d.numericPct]));

  // Latest movement per customer → migration counts.
  const seen = new Set<string>(); const move = { upgrade: 0, downgrade: 0, same: 0, new: 0 } as Record<string, number>;
  for (const h of histR) { const c = sx(h.customer_id); if (seen.has(c)) continue; seen.add(c); const mv = sx(h.movement); if (mv in move) move[mv]++; }

  const gradeLabel = (b: Row) => (locale === 'ar' && b.name_ar ? sx(b.name_ar) : sx(b.code) || sx(b.name));
  const graded = bands.length > 0 && [...count.values()].some((v) => v > 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.grade.dashTitle')} description={t('retail.grade.dashSub')} />
      {!graded ? (
        <EmptyCard text={t('retail.grade.empty')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('retail.grade.movement.upgrade')} value={String(move.upgrade)} icon={TrendingUp} tone="success" />
            <StatCard label={t('retail.grade.movement.downgrade')} value={String(move.downgrade)} icon={TrendingDown} tone={move.downgrade > 0 ? 'destructive' : 'success'} />
            <StatCard label={t('retail.grade.movement.new')} value={String(move.new)} icon={Star} tone="info" />
            <StatCard label={t('retail.grade.outlets')} value={String([...count.values()].reduce((a, b) => a + b, 0))} icon={Star} tone="primary" />
          </div>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">{t('retail.grade.countByGrade')}</h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-muted-foreground"><tr>
                    <th className="px-3 py-2 text-start font-medium">{t('retail.grade.grade')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('retail.grade.outlets')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('retail.grade.sales')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('retail.grade.distribution')}</th>
                  </tr></thead>
                  <tbody>
                    {bands.map((b) => {
                      const id = sx(b.id);
                      return (
                        <tr key={id} className="border-t">
                          <td className="px-3 py-2"><Badge variant="secondary">{gradeLabel(b)}</Badge></td>
                          <td className="px-3 py-2 text-end tabular-nums">{count.get(id) ?? 0}</td>
                          <td className="px-3 py-2 text-end tabular-nums">{Math.round(sales.get(id) ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-end tabular-nums">{distByGrade.get(id) ?? 0}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Link href="/settings/outlet-grades" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                {t('retail.grade.title')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
