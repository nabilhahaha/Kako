'use client';

import { useState } from 'react';
import { ShieldCheck, MapPin, Gauge, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { CapabilityMatrix } from './capability-matrix';
import { ScopePanel } from './scope-panel';
import { LimitsPanel } from './limits-panel';
import { SectionAccessPanel } from './section-access-panel';
import type { AuthzConsoleData } from '@/lib/erp/authz-console-server';

type Tab = 'capabilities' | 'scope' | 'limits' | 'sections';

/** VANTORA Authorization Console — one page, four authorization surfaces.
 *  Mobile-first: the tab strip scrolls horizontally on small screens. */
export function AuthzConsole({
  data,
  entities,
}: {
  data: AuthzConsoleData;
  entities: { key: string; labelAr: string; labelEn: string }[];
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('capabilities');

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'capabilities', label: t('authz.tabCapabilities'), icon: ShieldCheck },
    { id: 'scope', label: t('authz.tabScope'), icon: MapPin },
    { id: 'limits', label: t('authz.tabLimits'), icon: Gauge },
    { id: 'sections', label: t('authz.tabSections'), icon: Layers },
  ];

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">{t('authz.leastPrivilege')}</p>

      {/* Tab strip */}
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                active ? 'border-primary bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-secondary/60',
              )}
              aria-pressed={active}
            >
              <Icon className="h-4 w-4" />
              {tb.label}
            </button>
          );
        })}
      </div>

      {tab === 'capabilities' && (
        <CapabilityMatrix roles={data.roles} grants={data.capabilityGrants} fromBaseline={data.capabilityFromBaseline} />
      )}
      {tab === 'scope' && (
        <ScopePanel
          members={data.members}
          roles={data.roles}
          branches={data.branches}
          regions={data.regions}
          areas={data.areas}
          scopeRows={data.scopeRows}
        />
      )}
      {tab === 'limits' && <LimitsPanel members={data.members} roles={data.roles} limitRows={data.limitRows} />}
      {tab === 'sections' && <SectionAccessPanel entities={entities} />}
    </div>
  );
}
