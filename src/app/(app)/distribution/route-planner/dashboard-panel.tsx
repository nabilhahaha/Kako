'use client';

import { useEffect, useState } from 'react';
import { Users, Route as RouteIcon, CalendarDays, Target, Activity, Database, RefreshCw, Compass } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getRpDashboard, type RpDashboard } from './rp-dashboard-actions';
import { MISSION_STATUSES } from '@/lib/erp/route-planner-mission';

/**
 * Phase C1 — read-only Route Planner dashboard. Renders company-scoped KPI cards from
 * getRpDashboard (no writes). Lives inside the already-gated workspace; nothing here
 * mutates data.
 */
function Card({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DashboardPanel() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<RpDashboard | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const res = await getRpDashboard();
    if (res.ok) setData(res.data);
    setLoaded(true);
  }
  useEffect(() => { void refresh(); }, []);

  const fmt = (n: number) => n.toLocaleString(locale === 'ar' ? 'ar' : 'en');
  const dateFmt = (s: string | null) => (s ? new Date(s).toLocaleString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  if (!loaded) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('rpDash.loading')}</p>;
  if (!data) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('rpDash.empty')}</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Card icon={Users} label={t('rpDash.totalCustomers')} value={fmt(data.totalCustomers)} hint={t('rpDash.acrossDatasets', { n: data.datasets })} />
        <Card icon={Target} label={t('rpDash.coverage')} value={`${data.coveragePct}%`} hint={t('rpDash.validOfTotal', { v: fmt(data.validCustomers), t: fmt(data.totalCustomers) })} />
        <Card icon={RouteIcon} label={t('rpDash.dayPlans')} value={fmt(data.dayPlans)} />
        <Card icon={CalendarDays} label={t('rpDash.journeyPlans')} value={fmt(data.journeyPlans)} />
        <Card icon={Activity} label={t('rpDash.missionAdherence')} value={`${data.missionAdherencePct}%`} hint={t('rpDash.missionsTotal', { n: data.missionsTotal })} />
        <Card icon={Compass} label={t('rpDash.activeDataset')} value={data.activeDataset ?? '—'} />
        <Card icon={Database} label={t('rpDash.dataSources')} value={fmt(data.dataSources)} hint={t('rpDash.mappings', { n: data.fieldMappings })} />
        <Card icon={RefreshCw} label={t('rpDash.lastSync')} value={data.lastSync ? t(`rpDash.sync_${data.lastSync.status}` as 'rpDash.sync_success') : '—'} hint={data.lastSync ? dateFmt(data.lastSync.at) : t('rpDash.noSync')} />
      </div>

      <div className="rounded-lg border">
        <p className="border-b bg-muted/40 px-3 py-2 text-xs font-bold">{t('rpDash.missionsByStatus')}</p>
        <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-6">
          {MISSION_STATUSES.map((s) => (
            <div key={s} className="rounded border bg-background p-2 text-center">
              <p className="text-lg font-bold tabular-nums">{fmt(data.missionsByStatus[s] ?? 0)}</p>
              <p className="text-[10px] text-muted-foreground">{t(`rpDash.ms_${s}` as 'rpDash.ms_draft')}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">{t('rpDash.readOnlyNote')}</p>
    </div>
  );
}
