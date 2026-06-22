'use client';

import { useState } from 'react';
import { LayoutGrid, Database } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { RoutePlannerWorkspace } from './route-planner-workspace';
import { DatasetsPanel } from './datasets-panel';
import type { RoutePlannerSubscriptionView } from '@/lib/erp/route-planner-subscription';

/**
 * Phase B2 — minimal gated tab host. Keeps the existing session-only Planner exactly as
 * it was and adds one "Saved datasets" tab backed by the persisted working set
 * (erp_rp_datasets, via rp-dataset-actions). No new gate: this only renders inside the
 * already-permission-gated Route Planner page, so visibility is unchanged.
 */
export function RoutePlannerTabs({ subscription }: { subscription?: RoutePlannerSubscriptionView }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'planner' | 'datasets'>('planner');

  const tabBtn = (key: 'planner' | 'datasets', label: string, Icon: typeof LayoutGrid) => (
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
    </button>
  );

  return (
    <div>
      <div role="tablist" className="mb-3 flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
        {tabBtn('planner', t('routePlanner.tab_planner'), LayoutGrid)}
        {tabBtn('datasets', t('routePlanner.tab_datasets'), Database)}
      </div>

      {tab === 'planner' ? (
        <RoutePlannerWorkspace subscription={subscription} />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('routePlanner.tab_datasetsHint')}</p>
          <DatasetsPanel />
        </div>
      )}
    </div>
  );
}
