'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { missingVarianceReasons, VARIANCE_REASONS, type ConfirmationLineInput, type VarianceReason } from '@/lib/van-sales';
import { enqueueLoadConfirmation } from '@/lib/van-sales/offline-client';
import { confirmLoad } from '../actions';

export interface ConfirmLineView { productId: string; productName: string; loadedQty: number }

interface Row extends ConfirmLineView { accepted: number; reason: '' | VarianceReason }

export function ConfirmForm({ manifestId, lines }: { manifestId: string; lines: ConfirmLineView[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => lines.map((l) => ({ ...l, accepted: l.loadedQty, reason: '' })));
  const [busy, setBusy] = useState(false);

  const setRow = (i: number, patch: Partial<Row>) => setRows((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const acceptFull = () => setRows((s) => s.map((r) => ({ ...r, accepted: r.loadedQty, reason: '' })));
  const rejectFull = () => setRows((s) => s.map((r) => ({ ...r, accepted: 0 })));

  const buildLines = (): ConfirmationLineInput[] =>
    rows.map((r) => ({ productId: r.productId, loadedQty: r.loadedQty, acceptedQty: r.accepted, reason: r.reason || undefined }));

  async function confirm() {
    const cl = buildLines();
    if (missingVarianceReasons(cl).length) { toast.error(t('vanSales.confirm.needReason')); return; }
    setBusy(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueueLoadConfirmation({ manifestId, lines: cl });
        toast.success(t('vanSales.confirm.queuedOffline'));
        router.push('/field/van-sales');
        return;
      }
      const res = await confirmLoad({ manifestId, lines: cl });
      if (!res.ok) { toast.error(res.problems?.length ? res.problems.join(' · ') : res.error ?? t('vanSales.confirm.error')); return; }
      toast.success(res.requiresReview ? t('vanSales.confirm.sentForReview') : t('vanSales.confirm.confirmed'));
      router.push('/field/van-sales');
    } catch {
      toast.error(t('vanSales.confirm.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={acceptFull}><Check className="h-4 w-4" /> {t('vanSales.confirm.acceptFull')}</Button>
        <Button type="button" variant="outline" onClick={rejectFull}><X className="h-4 w-4" /> {t('vanSales.confirm.rejectFull')}</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          {rows.map((r, i) => {
            const variance = r.accepted !== r.loadedQty;
            return (
              <div key={r.productId} className="space-y-1.5 border-b border-border pb-3 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.productName}</span>
                  <span className="text-xs text-muted-foreground">{t('vanSales.confirm.loaded')}: {r.loadedQty}</span>
                </div>
                <div className="flex items-end gap-2">
                  <div className="w-28 space-y-1">
                    <span className="text-xs text-muted-foreground">{t('vanSales.confirm.accepted')}</span>
                    <Input
                      type="number" inputMode="numeric" min={0} max={r.loadedQty} value={r.accepted}
                      onChange={(e) => setRow(i, { accepted: Math.max(0, Math.min(r.loadedQty, Number(e.target.value))) })}
                    />
                  </div>
                  {variance && (
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-destructive">{t('vanSales.confirm.reason')}</span>
                      <Select value={r.reason} onChange={(e) => setRow(i, { reason: e.target.value as VarianceReason })}>
                        <option value="">—</option>
                        {VARIANCE_REASONS.map((rs) => <option key={rs} value={rs}>{t(`vanSales.confirm.reasons.${rs}`)}</option>)}
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Button onClick={confirm} disabled={busy} className="w-full">
        <Send className="h-4 w-4" /> {busy ? t('vanSales.confirm.confirming') : t('vanSales.confirm.confirm')}
      </Button>
    </div>
  );
}
