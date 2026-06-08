import { redirect } from 'next/navigation';
import { Target, Star, Store, ShieldCheck } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { PERFECT_STORE_ENABLED, complianceLeaderboard, teamScorecard, type OutletScoreRow } from '@/lib/perfect-store';

export const dynamic = 'force-dynamic';

type ScoreRow = { customer_id: string; salesman_id: string | null; score: number; band: string | null; period: string };

export default async function PerfectStoreScoresPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();

  if (!PERFECT_STORE_ENABLED()) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('distribution.psTitle')} description={t('distribution.psDescription')} />
        <EmptyState icon={<Target className="h-7 w-7" />} title={t('distribution.psDisabled')} />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: scoreData } = await supabase
    .from('erp_perfect_store_scores')
    .select('customer_id, salesman_id, score, band, period')
    .order('period', { ascending: false })
    .limit(1000);
  const all = (scoreData ?? []) as ScoreRow[];

  if (all.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('distribution.psTitle')} description={t('distribution.psDescription')} />
        <EmptyState icon={<Target className="h-7 w-7" />} title={t('distribution.psEmpty')} />
      </div>
    );
  }

  const latestPeriod = all[0].period;
  const rows: OutletScoreRow[] = all
    .filter((r) => r.period === latestPeriod)
    .map((r) => ({ customerId: r.customer_id, salesmanId: r.salesman_id, score: Number(r.score), band: r.band ?? 'none', period: r.period }));

  const avg = Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length);
  const perfect = rows.filter((r) => r.band === 'gold').length;
  const compliancePct = Math.round((rows.filter((r) => r.band === 'gold' || r.band === 'silver').length / rows.length) * 100);
  const leaderboard = complianceLeaderboard(rows).slice(0, 15);
  const team = teamScorecard(rows);

  // resolve names
  const custNames = new Map<string, string>();
  const { data: custs } = await supabase.from('erp_customers').select('id, name').in('id', [...new Set(rows.map((r) => r.customerId))]);
  for (const c of custs ?? []) custNames.set(c.id as string, (c.name as string) ?? '');
  const repNames = new Map<string, string>();
  const repIds = [...new Set(rows.map((r) => r.salesmanId).filter(Boolean))] as string[];
  if (repIds.length) {
    const { data: profs } = await supabase.from('erp_profiles').select('user_id, full_name').in('user_id', repIds);
    for (const p of profs ?? []) if (p.full_name) repNames.set(p.user_id as string, p.full_name as string);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('distribution.psTitle')} description={`${t('distribution.psDescription')} · ${t('distribution.psPeriod')}: ${latestPeriod}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('distribution.psKpiAvg')} value={String(avg)} icon={Target} tone="primary" />
        <StatCard label={t('distribution.psKpiPerfect')} value={String(perfect)} icon={Star} tone="success" />
        <StatCard label={t('distribution.psKpiOutlets')} value={String(rows.length)} icon={Store} tone="info" />
        <StatCard label={t('distribution.psKpiCompliance')} value={`${compliancePct}%`} icon={ShieldCheck} tone={compliancePct >= 70 ? 'success' : 'warning'} />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('distribution.psLeaderboardTitle')}</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="p-2 text-start">{t('distribution.psColOutlet')}</th>
                <th className="p-2 text-end">{t('distribution.psColScore')}</th>
                <th className="p-2 text-start">{t('distribution.psColBand')}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => (
                <tr key={r.customerId} className="border-b last:border-0">
                  <td className="p-2">{custNames.get(r.customerId) ?? r.customerId}</td>
                  <td className="p-2 text-end font-medium">{r.score}</td>
                  <td className="p-2 capitalize">{r.band}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('distribution.psTeamTitle')}</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="p-2 text-start">{t('distribution.psColRep')}</th>
                <th className="p-2 text-end">{t('distribution.psColOutlets')}</th>
                <th className="p-2 text-end">{t('distribution.psColAvg')}</th>
                <th className="p-2 text-end">{t('distribution.psColPerfect')}</th>
              </tr>
            </thead>
            <tbody>
              {team.map((tr) => (
                <tr key={tr.salesmanId} className="border-b last:border-0">
                  <td className="p-2">{repNames.get(tr.salesmanId) ?? tr.salesmanId}</td>
                  <td className="p-2 text-end">{tr.outlets}</td>
                  <td className="p-2 text-end font-medium">{tr.averageScore}</td>
                  <td className="p-2 text-end">{tr.perfectStores}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
