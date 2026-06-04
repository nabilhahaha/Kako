import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CheckCircle2, ListChecks, AlertTriangle, HeartPulse } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { nextBestActions, type AttentionItem } from '@/app/(app)/copilot/actions';
import { rankAttention, summarizeAttention } from '@/lib/erp/attention';

// ─────────────────────────────────────────────────────────────────────────────
// Attention Center — exceptions-first supervisor/field view. Reuses the existing
// RLS-scoped `nextBestActions` (role-tailored: skipped customers, GPS/out-of-route
// flags, overdue invoices, pending approvals, transfers, workflow queue…) and
// the pure attention/health scoring lib. READ-ONLY; additive; no new data path.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_VARIANT: Record<AttentionItem['severity'], 'info' | 'warning' | 'destructive'> = {
  info: 'info',
  warning: 'warning',
  danger: 'destructive',
};

const HEALTH_TONE: Record<'good' | 'attention' | 'critical', StatTone> = {
  good: 'success',
  attention: 'warning',
  critical: 'destructive',
};

export default async function AttentionCenterPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t, locale } = await getT();
  const res = await nextBestActions(locale);
  const items = res.ok && res.data ? res.data : [];
  const ranked = rankAttention(items);
  const summary = summarizeAttention(items);

  return (
    <div className="space-y-6">
      <PageHeader title={t('attention.title')} description={t('attention.subtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('attention.itemsLabel')} value={String(summary.itemCount)} icon={ListChecks} tone="info" />
        <StatCard label={t('attention.urgentLabel')} value={String(summary.danger)} icon={AlertTriangle} tone={summary.danger > 0 ? 'destructive' : 'success'} />
        <StatCard label={t('attention.healthLabel')} value={`${summary.healthScore}%`} icon={HeartPulse} tone={HEALTH_TONE[summary.healthBand]} />
      </div>

      {ranked.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title={t('attention.empty')} />
      ) : (
        <ul className="space-y-2">
          {ranked.map((it, i) => (
            <li key={i}>
              <Link
                href={it.href}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 text-start transition-colors hover:bg-secondary/50"
              >
                <span className="flex items-center gap-3">
                  <Badge variant={SEVERITY_VARIANT[it.severity]}>{it.count}</Badge>
                  <span className="text-sm font-medium">{it.title}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {t('attention.open')}
                  <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
