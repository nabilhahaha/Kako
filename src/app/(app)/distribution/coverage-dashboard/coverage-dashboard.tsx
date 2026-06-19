'use client';

import Link from 'next/link';
import { Target, CheckCircle2, AlertTriangle, MapPinOff, TrendingUp } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import {
  COVERAGE_STATUS_KEY,
  type CoverageRollup,
  type CoverageGroupBy,
} from '@/lib/distribution/coverage-engine';
import type { CoverageStatus } from '@/lib/distribution/coverage-engine';

export interface CoverageGroupView extends CoverageRollup {
  key: string;
  label: string;
}

const LIST = '/distribution/coverage-customers';

/**
 * CV-2 Coverage Dashboard (Simple Mode). Headline Coverage % + the four status
 * buckets as one-tap drill-downs into the customer list, plus a per-group table
 * (salesman/route) — worst coverage first. No weights, thresholds, or technical
 * metrics: a manager reads it at a glance. Pure presentation over the CV-1 rollup.
 */
export function CoverageDashboard({
  overall,
  groups,
  groupBy,
}: {
  overall: CoverageRollup;
  groups: CoverageGroupView[];
  groupBy: CoverageGroupBy;
}) {
  const { t } = useI18n();
  const groupParam = (key: string) => (groupBy === 'route' ? `route=${key}` : `salesman=${key}`);

  return (
    <div className="space-y-5">
      {/* Headline — the five numbers a manager needs, nothing else. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={t('coverage.headlineCoverage')}
          value={`${overall.coveragePct}%`}
          icon={Target}
          tone="primary"
          hint={t('coverage.ofNCustomers').replace('{n}', String(overall.total))}
        />
        <StatCard label={t('coverage.onTrack')} value={String(overall.onTrack)} icon={CheckCircle2} tone="success" href={`${LIST}?status=on_track`} />
        <StatCard label={t('coverage.underCovered')} value={String(overall.underCovered)} icon={AlertTriangle} tone="warning" href={`${LIST}?status=under_covered`} />
        <StatCard label={t('coverage.neverVisited')} value={String(overall.neverVisited)} icon={MapPinOff} tone="destructive" href={`${LIST}?status=never_visited`} />
        <StatCard label={t('coverage.overCovered')} value={String(overall.overCovered)} icon={TrendingUp} tone="info" href={`${LIST}?status=over_covered`} />
      </div>

      {/* By salesman / route — group toggle + worst-first table. */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('coverage.groupByLabel')}</span>
        <Link href="?by=salesman" className={`rounded-md border px-2 py-1 ${groupBy === 'salesman' ? 'bg-secondary font-medium' : ''}`}>{t('coverage.filterSalesman')}</Link>
        <Link href="?by=route" className={`rounded-md border px-2 py-1 ${groupBy === 'route' ? 'bg-secondary font-medium' : ''}`}>{t('coverage.filterRoute')}</Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{groupBy === 'route' ? t('coverage.colRoute') : t('coverage.colSalesman')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('coverage.headlineCoverage')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('coverage.onTrack')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('coverage.underCovered')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('coverage.neverVisited')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('coverage.overCovered')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const drill = (s: CoverageStatus) => g.key ? `${LIST}?status=${s}&${groupParam(g.key)}` : `${LIST}?status=${s}`;
                return (
                  <tr key={g.key || 'unassigned'} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium">{g.label}</td>
                    <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                      <CoverageBar pct={g.coveragePct} />
                    </td>
                    <NumCell value={g.onTrack} href={drill('on_track')} />
                    <NumCell value={g.underCovered} href={drill('under_covered')} tone="warning" />
                    <NumCell value={g.neverVisited} href={drill('never_visited')} tone="destructive" />
                    <NumCell value={g.overCovered} href={drill('over_covered')} tone="info" />
                  </tr>
                );
              })}
              {groups.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{t('coverage.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t('coverage.windowLabel')} · {t('coverage.dashHint')}</p>

      {/* Mobile: group cards */}
      <div className="space-y-2 sm:hidden">
        {groups.map((g) => (
          <Card key={`m-${g.key || 'unassigned'}`}>
            <CardContent className="space-y-1 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{g.label}</span>
                <span className="tabular-nums" dir="ltr">{g.coveragePct}%</span>
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{t('coverage.onTrack')}: {g.onTrack}</span>
                <span>{t('coverage.underCovered')}: {g.underCovered}</span>
                <span>{t('coverage.neverVisited')}: {g.neverVisited}</span>
                <span>{t('coverage.overCovered')}: {g.overCovered}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const tone = pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-destructive';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block">
        <span className={`block h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="font-semibold">{pct}%</span>
    </span>
  );
}

function NumCell({ value, href, tone }: { value: number; href: string; tone?: 'warning' | 'destructive' | 'info' }) {
  const cls = value === 0 ? 'text-muted-foreground' : tone === 'warning' ? 'text-warning' : tone === 'destructive' ? 'text-destructive' : tone === 'info' ? 'text-info' : '';
  return (
    <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
      {value > 0 ? <Link href={href} className={`hover:underline ${cls}`}>{value}</Link> : <span className={cls}>0</span>}
    </td>
  );
}
