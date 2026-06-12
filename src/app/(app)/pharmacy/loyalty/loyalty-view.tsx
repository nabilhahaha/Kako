'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { setLoyaltySettings, type LoyaltySettings, type LoyaltyLedgerRow } from './actions';

export function LoyaltyView({ settings, ledger, canManage, intlLocale }: {
  settings: LoyaltySettings; ledger: LoyaltyLedgerRow[]; canManage: boolean; intlLocale: string;
}) {
  const { t } = useI18n();
  const [earn, setEarn] = useState(String(settings.earn_rate));
  const [redeem, setRedeem] = useState(String(settings.redeem_rate));
  const [min, setMin] = useState(String(settings.min_redeem));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await setLoyaltySettings({ earn_rate: Number(earn), redeem_rate: Number(redeem), min_redeem: Number(min) });
    setSaving(false);
    if (!res.ok) { toast.error(res.error ?? t('pharmLoyalty.saveError')); return; }
    toast.success(t('pharmLoyalty.saved'));
  }

  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 pt-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground">{t('pharmLoyalty.earnRate')}
            <Input type="number" step="0.01" value={earn} onChange={(e) => setEarn(e.target.value)} disabled={!canManage} className="mt-1 h-10" dir="ltr" />
          </label>
          <label className="text-xs text-muted-foreground">{t('pharmLoyalty.redeemRate')}
            <Input type="number" step="0.01" value={redeem} onChange={(e) => setRedeem(e.target.value)} disabled={!canManage} className="mt-1 h-10" dir="ltr" />
          </label>
          <label className="text-xs text-muted-foreground">{t('pharmLoyalty.minRedeem')}
            <Input type="number" value={min} onChange={(e) => setMin(e.target.value)} disabled={!canManage} className="mt-1 h-10" dir="ltr" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{t('pharmLoyalty.hint')}</p>
        {canManage && (
          <Button disabled={saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} {t('pharmLoyalty.save')}</Button>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {ledger.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t('pharmLoyalty.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t('pharmLoyalty.customer')}</th>
                  <th className="p-3 text-start">{t('pharmLoyalty.invoice')}</th>
                  <th className="p-3 text-start">{t('pharmLoyalty.kind')}</th>
                  <th className="p-3 text-end">{t('pharmLoyalty.points')}</th>
                  <th className="p-3 text-start">{t('pharmLoyalty.date')}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-3">{r.customer ?? '—'}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground" dir="ltr">{r.invoice_no ?? '—'}</td>
                    <td className="p-3"><Badge variant={r.kind === 'earn' ? 'success' : 'secondary'}>{t(`pharmLoyalty.${r.kind}`)}</Badge></td>
                    <td className={`p-3 text-end tabular-nums font-medium ${r.points < 0 ? 'text-destructive' : 'text-emerald-600'}`} dir="ltr">{r.points > 0 ? '+' : ''}{r.points}</td>
                    <td className="p-3 text-xs text-muted-foreground" dir="ltr">{formatDate(r.created_at, intlLocale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
