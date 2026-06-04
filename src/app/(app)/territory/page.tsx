import { redirect } from 'next/navigation';
import { Map as MapIcon, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { territoryHealth } from '@/app/(app)/home-actions';
import { rollupTerritory, territorySummary, type TerritoryRollup } from '@/lib/erp/territory';

// Territory Health — a dependency-free route-coverage health grid (no map lib).
// Worst-first so low-coverage routes surface immediately.

const BAND_BAR: Record<TerritoryRollup['band'], string> = { good: 'bg-success', attention: 'bg-warning', critical: 'bg-destructive', unknown: 'bg-muted-foreground/40' };
const BAND_TONE: Record<TerritoryRollup['band'], StatTone> = { good: 'success', attention: 'warning', critical: 'destructive', unknown: 'info' };

export default async function TerritoryHealthPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed =
    ctx.isPlatformOwner || ctx.isSuperAdmin || hasPermission(ctx, 'reports.view') ||
    ctx.memberships.some((m) => m.role === 'admin' || m.role === 'manager' || m.role === 'supervisor');
  if (!allowed) redirect('/dashboard');

  const { t } = await getT();
  const res = await territoryHealth();
  const rows = res.ok && res.data ? res.data : [];
  const rolled = rollupTerritory(rows);
  const summary = territorySummary(rows);

  return (
    <div className="space-y-6">
      <PageHeader title={t('home.territoryTitle')} description={t('home.territorySubtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('home.avgCoverage')} value={summary.avgCoverage == null ? '—' : `${summary.avgCoverage}%`} icon={MapIcon} tone={BAND_TONE[summary.avgCoverage == null ? 'unknown' : summary.avgCoverage >= 80 ? 'good' : summary.avgCoverage >= 50 ? 'attention' : 'critical']} />
        <StatCard label={t('home.healthyRoutes')} value={String(summary.good)} icon={ShieldCheck} tone="success" />
        <StatCard label={t('home.atRiskRoutes')} value={String(summary.critical + summary.attention)} icon={AlertTriangle} tone={summary.critical > 0 ? 'destructive' : summary.attention > 0 ? 'warning' : 'success'} />
      </div>

      {rolled.length === 0 ? (
        <EmptyState icon={<MapIcon />} title={t('home.territoryEmpty')} />
      ) : (
        <div className="space-y-2">
          {rolled.map((r, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{r.route}</span>
                  <span className="shrink-0 font-semibold tabular-nums" dir="ltr">{r.coveragePct == null ? '—' : `${Math.round(r.coveragePct)}%`}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className={`h-full rounded-full ${BAND_BAR[r.band]}`} style={{ width: `${Math.max(4, r.coveragePct ?? 0)}%` }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
