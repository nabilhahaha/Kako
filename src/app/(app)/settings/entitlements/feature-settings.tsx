'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import { setFeatureEntitlement } from './actions';
import type { FeatureRow } from '@/lib/entitlements/matrix-server';

export function FeatureSettings({ rows }: { rows: FeatureRow[] }) {
  const { t } = useI18n();
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [`${r.moduleKey}:${r.featureKey}`, r.isEnabled])));
  const [busy, setBusy] = useState<string | null>(null);

  // Group features by module for a tidy list.
  const byModule = new Map<string, FeatureRow[]>();
  for (const r of rows) { const list = byModule.get(r.moduleKey) ?? []; list.push(r); byModule.set(r.moduleKey, list); }

  async function toggle(r: FeatureRow) {
    const key = `${r.moduleKey}:${r.featureKey}`;
    const next = !state[key];
    setBusy(key);
    setState((s) => ({ ...s, [key]: next }));
    try {
      const res = await setFeatureEntitlement(r.moduleKey, r.featureKey, next);
      if (!res.ok) { setState((s) => ({ ...s, [key]: !next })); toast.error(res.error ?? t('entitlements.error')); return; }
      toast.success(t('entitlements.saved'));
    } catch {
      setState((s) => ({ ...s, [key]: !next }));
      toast.error(t('entitlements.error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {[...byModule.entries()].map(([moduleKey, feats]) => (
        <Card key={moduleKey}>
          <CardContent className="space-y-1 pt-6">
            <div className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{feats[0].moduleLabelEn}</div>
            {feats.map((r) => {
              const key = `${r.moduleKey}:${r.featureKey}`;
              return (
                <label key={key} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
                  <span>{r.labelEn}</span>
                  <input type="checkbox" checked={Boolean(state[key])} disabled={busy === key} onChange={() => toggle(r)} />
                </label>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
