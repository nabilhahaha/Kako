'use client';

import Link from 'next/link';
import { Target, AlertTriangle, MapPinOff, Scale } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { StatCard } from '@/components/shared/stat-card';
import { SectionCard } from '@/components/admin/section-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TerritoryAudit, BalanceSection } from '@/lib/tis/audit';

const LIST = '/distribution/coverage-customers';

/**
 * TA-2 Territory Audit (Simple Mode). A headline strip + a card per finding —
 * coverage gaps · territory & route balance · distribution · internal white-space.
 * Plain language, no weights/thresholds; sections without data show a "needs X"
 * hint (graceful degradation). Pure presentation over the TA-1 read-model.
 */
export function TerritoryAuditView({ audit, labels }: { audit: TerritoryAudit; labels: Record<string, string> }) {
  const { t } = useI18n();
  const label = (k: string) => (k ? labels[k] ?? '—' : t('territoryAudit.unassigned'));
  const h = audit.headline;

  return (
    <div className="space-y-5">
      {/* Headline — the few numbers a manager needs. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('coverage.headlineCoverage')} value={`${h.coveragePct}%`} icon={Target} tone="primary" hint={t('coverage.ofNCustomers').replace('{n}', String(h.customers))} />
        <StatCard label={t('territoryAudit.coverageGaps')} value={String(h.gapCount)} icon={AlertTriangle} tone="warning" href={`${LIST}?status=under_covered`} />
        <StatCard label={t('territoryAudit.worstBalance')} value={`${h.worstBalancePct}%`} icon={Scale} tone={h.worstBalancePct >= 70 ? 'success' : 'destructive'} />
        <StatCard label={t('territoryAudit.whiteSpace')} value={String(h.whiteSpaceCount)} icon={MapPinOff} tone="info" />
      </div>

      {/* Coverage gaps by salesman (Mode B/C). */}
      <SectionCard title={t('territoryAudit.coverageGapsTitle')}>
        {audit.coverageGaps.available ? (
          <BalanceTable section={{ groupBy: 'salesman', groups: audit.coverageGaps.byGroup, workloadBalancePct: 0, valueBalancePct: 0 }} label={label} t={t} coverageOnly />
        ) : (
          <NeedsHint text={t('territoryAudit.needsCoverage')} />
        )}
      </SectionCard>

      {/* Territory + route imbalance. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title={t('territoryAudit.territoryBalance')}>
          {audit.territoryBalance ? <BalanceTable section={audit.territoryBalance} label={label} t={t} /> : <NeedsHint text={t('territoryAudit.needsTerritory')} />}
        </SectionCard>
        <SectionCard title={t('territoryAudit.routeBalance')}>
          {audit.routeBalance ? <BalanceTable section={audit.routeBalance} label={label} t={t} /> : <NeedsHint text={t('territoryAudit.needsRoutes')} />}
        </SectionCard>
      </div>

      {/* Distribution + white-space. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title={t('territoryAudit.distribution')}>
          <p className="mb-2 text-xs text-muted-foreground">{t('territoryAudit.byGrade')}</p>
          <div className="flex flex-wrap gap-2">
            {audit.distribution.byGrade.map((b) => (
              <Badge key={b.key} variant="secondary">{b.key.toUpperCase()} · {b.count}</Badge>
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
            <Row label={t('territoryAudit.assigned')} value={audit.distribution.assigned} />
            <Row label={t('territoryAudit.unassigned')} value={audit.distribution.unassigned} />
          </dl>
        </SectionCard>
        <SectionCard title={t('territoryAudit.whiteSpaceTitle')}>
          <p className="mb-2 text-xs text-muted-foreground">{t('territoryAudit.whiteSpaceHint')}</p>
          <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
            <Row label={t('territoryAudit.unassigned')} value={audit.whiteSpace.counts.unassigned} />
            <Row label={t('coverage.neverVisited')} value={audit.whiteSpace.counts.neverVisited} href={`${LIST}?status=never_visited`} />
            <Row label={t('territoryAudit.noCadence')} value={audit.whiteSpace.counts.noCadence} />
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}

function BalanceTable({ section, label, t, coverageOnly }: { section: BalanceSection; label: (k: string) => string; t: (k: string) => string; coverageOnly?: boolean }) {
  if (section.groups.length === 0) return <NeedsHint text={t('coverage.empty')} />;
  return (
    <>
      {!coverageOnly && (
        <p className="mb-2 text-xs text-muted-foreground">
          {t('territoryAudit.workloadBalance')}: <span className="font-semibold tabular-nums" dir="ltr">{section.workloadBalancePct}%</span>
        </p>
      )}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-start font-medium">{t('territoryAudit.group')}</th>
              <th className="px-2 py-1.5 text-end font-medium">{t('territoryAudit.customers')}</th>
              {!coverageOnly && <th className="px-2 py-1.5 text-end font-medium">{t('territoryAudit.workload')}</th>}
              <th className="px-2 py-1.5 text-end font-medium">{t('coverage.headlineCoverage')}</th>
            </tr>
          </thead>
          <tbody>
            {section.groups.slice(0, 12).map((g) => (
              <tr key={g.key || 'unassigned'} className="border-b last:border-0">
                <td className="px-2 py-1.5">{label(g.key)}</td>
                <td className="px-2 py-1.5 text-end tabular-nums" dir="ltr">{g.customers}</td>
                {!coverageOnly && <td className="px-2 py-1.5 text-end tabular-nums" dir="ltr">{g.workload}</td>}
                <td className="px-2 py-1.5 text-end tabular-nums" dir="ltr">{g.coveragePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NeedsHint({ text }: { text: string }) {
  return <Card className="border-dashed"><CardContent className="p-4 text-center text-sm text-muted-foreground">{text}</CardContent></Card>;
}

function Row({ label, value, href }: { label: string; value: number; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums" dir="ltr">
        {href && value > 0 ? <Link href={href} className="hover:underline">{value}</Link> : value}
      </dd>
    </div>
  );
}
