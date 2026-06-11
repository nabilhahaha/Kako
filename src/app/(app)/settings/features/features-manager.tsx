'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { applyFeatureTemplate, setFeatureFlag } from './actions';

export interface FeatureView {
  key: string;
  domain: 'inventory' | 'pos' | 'governance' | 'scanning';
  labelKey: string;
  descKey: string;
  templates: string[];
  enabled: boolean;
}

const DOMAINS: FeatureView['domain'][] = ['inventory', 'pos', 'governance', 'scanning'];
const TEMPLATES = ['lite', 'standard', 'enterprise'] as const;

export function FeaturesManager({ features }: { features: FeatureView[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, boolean>>(
    () => Object.fromEntries(features.map((f) => [f.key, f.enabled])),
  );
  const [pending, start] = useTransition();

  function toggle(key: string, enabled: boolean) {
    setRows((s) => ({ ...s, [key]: enabled }));
    start(async () => {
      const res = await setFeatureFlag(key, enabled);
      if (!res.ok) { toast.error(res.error ?? t('features.saveError')); setRows((s) => ({ ...s, [key]: !enabled })); return; }
      toast.success(t('features.saved'));
      router.refresh();
    });
  }

  function applyTemplate(tmpl: string) {
    start(async () => {
      const res = await applyFeatureTemplate(tmpl);
      if (!res.ok) { toast.error(res.error ?? t('features.saveError')); return; }
      toast.success(t('features.templateApplied'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm font-medium">{t('features.startFrom')}</span>
          {TEMPLATES.map((tmpl) => (
            <Button key={tmpl} size="sm" variant="outline" disabled={pending} onClick={() => applyTemplate(tmpl)}>
              {t(`features.template.${tmpl}`)}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">{t('features.startFromHint')}</span>
        </CardContent>
      </Card>

      {DOMAINS.map((domain) => {
        const list = features.filter((f) => f.domain === domain);
        if (!list.length) return null;
        return (
          <Card key={domain}>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">{t(`features.domain.${domain}`)}</h3>
              <div className="divide-y">
                {list.map((f) => (
                  <div key={f.key} className="flex items-start justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t(f.labelKey)}</span>
                        {f.templates.includes('enterprise') && !f.templates.includes('standard') && (
                          <Badge variant="secondary" className="text-[10px]">{t('features.template.enterprise')}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{t(f.descKey)}</p>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox" className="peer sr-only"
                        checked={rows[f.key] ?? false} disabled={pending}
                        onChange={(e) => toggle(f.key, e.target.checked)}
                      />
                      <div className="h-5 w-9 rounded-full bg-input transition peer-checked:bg-primary after:absolute after:start-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4" />
                    </label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
