'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, Database, BarChart3, ClipboardList, Inbox, Plug } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { RoutePlannerWorkspace } from './route-planner-workspace';
import { DatasetsPanel } from './datasets-panel';
import { DashboardPanel } from './dashboard-panel';
import { MissionsBoard } from './missions-board';
import { RequestCenterPanel } from './request-center-panel';
import { ConnectorsPanel } from './connectors-panel';
import { getRpTabBadges, type RpTabBadges } from './rp-tab-badges-actions';
import { loadDatasetById } from './rp-dataset-load';
import type { DatasetHeader } from './rp-dataset-actions';
import type { RoutePlannerSubscriptionView } from '@/lib/erp/route-planner-subscription';
import type { TisDataset } from '@/lib/tis/dataset';

/**
 * Phase B2/B3 — minimal gated tab host. Keeps the existing session-only Planner and adds
 * a "Saved datasets" tab backed by the persisted working set. B3: loading a saved dataset
 * rehydrates it into the Planner (injectedDataset) and switches to the Planner tab. No new
 * gate: this only renders inside the already-permission-gated Route Planner page.
 */
export function RoutePlannerTabs({ subscription }: { subscription?: RoutePlannerSubscriptionView }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'planner' | 'datasets' | 'dashboard' | 'missions' | 'requests' | 'connectors'>('planner');
  const [injected, setInjected] = useState<TisDataset | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [badges, setBadges] = useState<RpTabBadges | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await getRpTabBadges();
      if (res.ok) setBadges(res.data);
    })();
  }, []);

  async function onLoadIntoPlanner(d: DatasetHeader) {
    setLoadingId(d.id);
    try {
      const loaded = await loadDatasetById(d);
      // New object identity each load so the planner effect re-fires even for the same id.
      setInjected({ ...loaded.tis });
      setTab('planner');
    } finally {
      setLoadingId(null);
    }
  }

  const tabBtn = (key: 'planner' | 'datasets' | 'dashboard' | 'missions' | 'requests' | 'connectors', label: string, Icon: typeof LayoutGrid, badge?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
        tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge ? (
        <span className={`ms-0.5 rounded-full px-1.5 text-[10px] font-bold ${tab === key ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary'}`}>{badge}</span>
      ) : null}
    </button>
  );

  return (
    <div>
      <div role="tablist" className="mb-3 flex flex-wrap items-center gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
        {tabBtn('planner', t('routePlanner.tab_planner'), LayoutGrid)}
        {tabBtn('datasets', t('routePlanner.tab_datasets'), Database, badges?.datasets)}
        {tabBtn('dashboard', t('routePlanner.tab_dashboard'), BarChart3)}
        {tabBtn('missions', t('routePlanner.tab_missions'), ClipboardList, badges?.missionsOpen)}
        {tabBtn('requests', t('routePlanner.tab_requests'), Inbox, badges?.requestsOpen)}
        {tabBtn('connectors', t('routePlanner.tab_connectors'), Plug, badges?.sources)}
      </div>

      {tab === 'planner' && <RoutePlannerWorkspace subscription={subscription} injectedDataset={injected} />}
      {tab === 'datasets' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('routePlanner.tab_datasetsHint')}</p>
          <DatasetsPanel onLoad={onLoadIntoPlanner} loadingId={loadingId} />
        </div>
      )}
      {tab === 'dashboard' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('routePlanner.tab_dashboardHint')}</p>
          <DashboardPanel />
        </div>
      )}
      {tab === 'missions' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('routePlanner.tab_missionsHint')}</p>
          <MissionsBoard />
        </div>
      )}
      {tab === 'requests' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('routePlanner.tab_requestsHint')}</p>
          <RequestCenterPanel />
        </div>
      )}
      {tab === 'connectors' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('routePlanner.tab_connectorsHint')}</p>
          <ConnectorsPanel />
        </div>
      )}
    </div>
  );
}
