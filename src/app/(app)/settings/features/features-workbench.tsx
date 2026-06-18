'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Layers } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdminWorkbench, useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { EntityListPanel } from '@/components/admin/entity-list-panel';
import { EntityHeader, DetailPlaceholder } from '@/components/admin/entity-detail';
import { SectionCard } from '@/components/admin/section-card';
import { ContextPanel, ContextSection, SummaryList } from '@/components/admin/context-panel';
import { ActivityFeed } from '@/components/admin/activity-feed';
import { applyFeatureTemplate, setFeatureFlag } from './actions';

export interface FeatureView {
  key: string;
  domain: 'inventory' | 'pos' | 'governance' | 'scanning' | 'contacts';
  labelKey: string;
  descKey: string;
  templates: string[];
  enabled: boolean;
}

const DOMAINS: FeatureView['domain'][] = ['inventory', 'pos', 'governance', 'scanning', 'contacts'];
const TEMPLATES = ['lite', 'standard', 'enterprise'] as const;
const TEMPLATES_ID = '__templates__';

/**
 * Features & Applications on the Admin Workbench. Left = capability groups
 * (domains ≈ "modules") + a Templates entry; center = the group's features
 * (≈ "features") as toggles. Reuses setFeatureFlag / applyFeatureTemplate
 * verbatim — no business-logic / permission / RLS / workflow change.
 */
export function FeaturesWorkbench({ features }: { features: FeatureView[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { selectedId, select } = useWorkbenchSelection('inventory');
  const [rows, setRows] = useState<Record<string, boolean>>(
    () => Object.fromEntries(features.map((f) => [f.key, f.enabled])),
  );

  function toggle(key: string, enabled: boolean) {
    setRows((p) => ({ ...p, [key]: enabled }));
    start(async () => {
      const res = await setFeatureFlag(key, enabled);
      if (!res.ok) { toast.error(t('features.saveError')); router.refresh(); return; }
      toast.success(t('features.saved'));
    });
  }
  function applyTemplate(tmpl: string) {
    start(async () => {
      const res = await applyFeatureTemplate(tmpl);
      if (!res.ok) { toast.error(t('features.saveError')); return; }
      toast.success(t('features.templateApplied'));
      router.refresh();
    });
  }

  const enabledCount = (domain: string) => features.filter((f) => f.domain === domain && rows[f.key]).length;

  const list = (
    <EntityListPanel
      items={[
        { id: TEMPLATES_ID, primary: t('adminWb.templates') },
        ...DOMAINS.map((d) => ({
          id: d,
          primary: t(`features.domain.${d}`),
          secondary: `${enabledCount(d)}/${features.filter((f) => f.domain === d).length}`,
        })),
      ]}
      selectedId={selectedId}
      onSelect={select}
      searchPlaceholder={t('adminWb.featuresTitle')}
    />
  );

  if (!selectedId) {
    return <AdminWorkbench list={list} detail={<DetailPlaceholder text={t('adminWb.featuresPrompt')} />} />;
  }

  const isTemplates = selectedId === TEMPLATES_ID;
  const domainFeatures = features.filter((f) => f.domain === selectedId);

  const detail = (
    <div>
      <EntityHeader
        title={isTemplates ? t('adminWb.templates') : t(`features.domain.${selectedId}`)}
        status={!isTemplates && <Badge variant="secondary">{enabledCount(selectedId)}/{domainFeatures.length} {t('adminWb.enabled')}</Badge>}
      />
      {isTemplates ? (
        <SectionCard title={t('adminWb.templates')}>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tmpl) => (
              <Button key={tmpl} variant="outline" size="sm" disabled={pending} onClick={() => applyTemplate(tmpl)}>
                <Layers className="h-4 w-4" /> {t(`features.template.${tmpl}`)}
              </Button>
            ))}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title={t(`features.domain.${selectedId}`)}>
          <div className="space-y-1">
            {domainFeatures.map((f) => (
              <label key={f.key} className="flex items-start justify-between gap-3 rounded-md border p-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(f.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(f.descKey)}</p>
                </div>
                <input type="checkbox" className="mt-1 shrink-0" checked={rows[f.key] ?? false} disabled={pending} onChange={(e) => toggle(f.key, e.target.checked)} />
              </label>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );

  const context = (
    <ContextPanel>
      <ContextSection title={t('adminWb.summary')}>
        <SummaryList rows={DOMAINS.map((d) => ({ label: t(`features.domain.${d}`), value: `${enabledCount(d)}/${features.filter((f) => f.domain === d).length}` }))} />
      </ContextSection>
      <ContextSection title={t('adminWb.audit')}>
        <ActivityFeed entityId={null} entities={['feature_flag', 'feature_template']} />
      </ContextSection>
    </ContextPanel>
  );

  return <AdminWorkbench list={list} detail={detail} context={context} contextLabel={t('adminWb.contextLabel')} />;
}
