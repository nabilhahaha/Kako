'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import { setModuleEntitlement } from '../actions';
import type { MatrixRow } from '@/lib/entitlements/matrix-server';

export function CapabilityMatrix({ companyId, rows }: { companyId: string; rows: MatrixRow[] }) {
  const { t } = useI18n();
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.moduleKey, r.isEnabled])));
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(moduleKey: string) {
    const next = !state[moduleKey];
    setBusy(moduleKey);
    setState((s) => ({ ...s, [moduleKey]: next }));
    try {
      const res = await setModuleEntitlement(companyId, moduleKey, next);
      if (!res.ok) { setState((s) => ({ ...s, [moduleKey]: !next })); toast.error(res.error ?? t('entitlements.error')); return; }
      toast.success(t('entitlements.saved'));
    } catch {
      setState((s) => ({ ...s, [moduleKey]: !next }));
      toast.error(t('entitlements.error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        {rows.map((r) => (
          <label key={r.moduleKey} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
            <span className="flex items-center gap-2">
              <span className="font-medium">{r.labelEn}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{t(`entitlements.cat.${r.category}`)}</span>
              {r.platformFlag && <span className="text-xs text-muted-foreground">{r.platformFlag}</span>}
            </span>
            <input type="checkbox" checked={Boolean(state[r.moduleKey])} disabled={busy === r.moduleKey} onChange={() => toggle(r.moduleKey)} />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
