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
import { captureEntityMedia, syncMedia } from '@/lib/offline-sync/media';
import { confirmLoad } from '../actions';
import { useCriticalAction } from '@/lib/critical-action';

export interface ConfirmLineView { productId: string; productName: string; loadedQty: number }

interface Row extends ConfirmLineView { accepted: number; reason: '' | VarianceReason }

export function ConfirmForm({ manifestId, lines }: { manifestId: string; lines: ConfirmLineView[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const runCritical = useCriticalAction();
  const [rows, setRows] = useState<Row[]>(() => lines.map((l) => ({ ...l, accepted: l.loadedQty, reason: '' })));
  const [evidence, setEvidence] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const setRow = (i: number, patch: Partial<Row>) => setRows((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const acceptFull = () => setRows((s) => s.map((r) => ({ ...r, accepted: r.loadedQty, reason: '' })));
  const rejectFull = () => setRows((s) => s.map((r) => ({ ...r, accepted: 0 })));
  const hasVariance = rows.some((r) => r.accepted !== r.loadedQty);

  const buildLines = (): ConfirmationLineInput[] =>
    rows.map((r) => ({ productId: r.productId, loadedQty: r.loadedQty, acceptedQty: r.accepted, reason: r.reason || undefined }));

  // Van load confirmation — governed by the Critical Action standard (confirm +
  // server audit). silentSuccess keeps the rich, state-specific toasts below
  // (offline-queued / sent-for-review / confirmed) and the offline path.
  async function confirm() {
    const cl = buildLines();
    if (missingVarianceReasons(cl).length) { toast.error(t('vanSales.confirm.needReason')); return; }
    await runCritical({
      catalogKey: 'van.loadConfirm',
      action: t('critical.actions.vanLoadConfirm'),
      silentSuccess: true,
      execute: async () => {
        setBusy(true);
        try {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            await enqueueLoadConfirmation({ manifestId, lines: cl });
            if (evidence.length) toast.info(t('vanSales.confirm.evidenceOnlineOnly'));
            toast.success(t('vanSales.confirm.queuedOffline'));
            router.push('/field/van-sales');
            return { ok: true };
          }
          const res = await confirmLoad({ manifestId, lines: cl });
          if (!res.ok) {
            return { ok: false, error: res.problems?.length ? res.problems.join(' · ') : res.error ?? t('vanSales.confirm.error') };
          }
          // Variance evidence → attach via the shared field-media pipeline.
          if (evidence.length && res.id) {
            for (const f of evidence) await captureEntityMedia('van_load_confirmation', res.id, f);
            await syncMedia();
            toast.success(t('vanSales.confirm.photosAttached'));
          }
          toast.success(res.requiresReview ? t('vanSales.confirm.sentForReview') : t('vanSales.confirm.confirmed'));
          router.push('/field/van-sales');
          return { ok: true };
        } catch {
          return { ok: false, error: t('vanSales.confirm.error') };
        } finally {
          setBusy(false);
        }
      },
    });
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

      {hasVariance && (
        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <span className="text-xs font-medium">{t('vanSales.confirm.evidence')}</span>
            <input
              type="file" accept="image/*" capture="environment" multiple
              className="block w-full text-sm"
              onChange={(e) => setEvidence(Array.from(e.target.files ?? []))}
            />
            <span className="text-xs text-muted-foreground">{evidence.length ? `${evidence.length} · ${t('vanSales.confirm.evidenceHint')}` : t('vanSales.confirm.evidenceHint')}</span>
          </CardContent>
        </Card>
      )}

      <Button onClick={confirm} disabled={busy} className="w-full">
        <Send className="h-4 w-4" /> {busy ? t('vanSales.confirm.confirming') : t('vanSales.confirm.confirm')}
      </Button>
    </div>
  );
}
