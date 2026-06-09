'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { setVanSalesSettings } from '@/app/(app)/field/van-sales/settings-actions';
import type { VanSalesSettings } from '@/lib/van-sales/settings-server';

type BoolKey = 'isEnabled' | 'requirePhysicalCountOnClose' | 'allowNegativeVanStock' | 'autoConfirmDirectLoad';

export function VanSalesAdminForm({ initial }: { initial: VanSalesSettings }) {
  const { t } = useI18n();
  const [s, setS] = useState<VanSalesSettings>(initial);
  const [busy, setBusy] = useState(false);

  const toggle = (k: BoolKey) => setS((p) => ({ ...p, [k]: !p[k] }));

  async function save() {
    setBusy(true);
    try {
      const res = await setVanSalesSettings({
        isEnabled: s.isEnabled,
        requirePhysicalCountOnClose: s.requirePhysicalCountOnClose,
        allowNegativeVanStock: s.allowNegativeVanStock,
        autoConfirmDirectLoad: s.autoConfirmDirectLoad,
        discountCapPct: s.discountCapPct,
      });
      if (!res.ok) { toast.error(res.error ?? t('vanSales.admin.error')); return; }
      toast.success(t('vanSales.admin.saved'));
    } catch {
      toast.error(t('vanSales.admin.error'));
    } finally {
      setBusy(false);
    }
  }

  const Toggle = ({ label, k }: { label: string; k: BoolKey }) => (
    <label className="flex items-center justify-between gap-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={Boolean(s[k])} onChange={() => toggle(k)} />
    </label>
  );

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <label className="flex items-center justify-between gap-3 border-b border-border pb-3 text-sm font-semibold">
          <span>{t('vanSales.admin.enableModule')}</span>
          <input type="checkbox" checked={s.isEnabled} onChange={() => toggle('isEnabled')} />
        </label>
        <p className="text-xs text-muted-foreground">{t('vanSales.admin.enableDesc')} {t('vanSales.admin.flagNote')}</p>

        <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.admin.policy')}</div>
        <Toggle label={t('vanSales.admin.requireCount')} k="requirePhysicalCountOnClose" />
        <Toggle label={t('vanSales.admin.allowNegative')} k="allowNegativeVanStock" />
        <Toggle label={t('vanSales.admin.autoConfirm')} k="autoConfirmDirectLoad" />

        <div className="space-y-1.5">
          <Label>{t('vanSales.admin.discountCap')}</Label>
          <Input
            type="number" inputMode="numeric" value={s.discountCapPct ?? ''}
            onChange={(e) => setS((p) => ({ ...p, discountCapPct: e.target.value === '' ? null : Number(e.target.value) }))}
          />
        </div>

        <Button onClick={save} disabled={busy} className="w-full">
          <Save className="h-4 w-4" /> {busy ? t('vanSales.admin.saving') : t('vanSales.admin.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
