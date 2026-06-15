'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Calculator, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ProductCombobox, type ComboRow } from '@/components/shared/product-combobox';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';
import {
  computeVanReconciliation,
  settleVanReconciliation,
  rejectVanReconciliation,
} from '@/app/(app)/fmcg/actions';

export interface ReconHeader {
  id: string;
  work_session_id: string;
  recon_date: string;
  status: string;
  total_variance_value: number;
}
export interface ReconLine {
  id: string;
  reconciliation_id: string;
  product_id: string | null;
  expected_qty: number;
  actual_qty: number;
  variance_qty: number;
  variance_value: number;
}

interface DraftLine {
  productId: string;
  label: string;
  actualQty: string;
}

const STATUS_VARIANT: Record<string, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  draft: 'secondary',
  pending_approval: 'warning',
  settled: 'success',
  rejected: 'destructive',
};

export function VanReconciliationManager({
  headers,
  lines,
  productLabels,
  canManage,
  canApprove,
}: {
  headers: ReconHeader[];
  lines: ReconLine[];
  productLabels: Record<string, string>;
  canManage: boolean;
  canApprove: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [sessionId, setSessionId] = useState('');
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [pickerId, setPickerId] = useState<string | null>(null);

  function statusLabel(s: string) {
    const camel = s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return t(`fmcgw1.status${camel.charAt(0).toUpperCase()}${camel.slice(1)}`);
  }

  function addLine(id: string | null, row: ComboRow | null) {
    if (!id || !row) return;
    if (draft.some((d) => d.productId === id)) return;
    setDraft((prev) => [...prev, { productId: id, label: row.primary, actualQty: '0' }]);
    setPickerId(null);
  }

  function setQty(productId: string, qty: string) {
    setDraft((prev) => prev.map((d) => (d.productId === productId ? { ...d, actualQty: qty } : d)));
  }

  function removeLine(productId: string) {
    setDraft((prev) => prev.filter((d) => d.productId !== productId));
  }

  function compute() {
    if (!sessionId.trim() || draft.length === 0) {
      toast.error(t('fmcgw1.error'));
      return;
    }
    startTransition(async () => {
      const res = await computeVanReconciliation(
        sessionId.trim(),
        draft.map((d) => ({ product_id: d.productId, actual_qty: Number(d.actualQty) || 0 })),
      );
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.saved'));
      setDraft([]);
      router.refresh();
    });
  }

  function settle(id: string) {
    startTransition(async () => {
      const res = await settleVanReconciliation(id);
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.saved'));
      router.refresh();
    });
  }

  function reject(id: string) {
    const reason = window.prompt(t('fmcgw1.reconRejectReason')) ?? '';
    startTransition(async () => {
      const res = await rejectVanReconciliation(id, reason);
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.saved'));
      router.refresh();
    });
  }

  const linesByRecon = new Map<string, ReconLine[]>();
  for (const l of lines) {
    const arr = linesByRecon.get(l.reconciliation_id) ?? [];
    arr.push(l);
    linesByRecon.set(l.reconciliation_id, arr);
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1">
              <Label>{t('fmcgw1.reconSession')}</Label>
              <Input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder={t('fmcgw1.reconSessionPlaceholder')}
                dir="ltr"
              />
            </div>

            <div className="space-y-1">
              <Label>{t('fmcgw1.reconAddLine')}</Label>
              <ProductCombobox value={pickerId} onSelect={addLine} placeholder={t('fmcgw1.selectProduct')} />
            </div>

            {draft.length === 0 ? (
              <EmptyState title={t('fmcgw1.reconEmpty')} />
            ) : (
              <>
                {/* Mobile (< sm): product · qty input · delete, in a row. */}
                <div className="space-y-2 sm:hidden">
                  {draft.map((d) => (
                    <div key={d.productId} className="flex items-center gap-2 rounded-md border p-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.label}</span>
                      <Input
                        type="number" min={0} step="0.001" dir="ltr"
                        value={d.actualQty}
                        onChange={(e) => setQty(d.productId, e.target.value)}
                        className="h-9 w-24 shrink-0 text-center"
                      />
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeLine(d.productId)} aria-label={t('fmcgw1.delete')}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
                {/* Desktop (sm+): table. */}
                <div className="hidden overflow-x-auto rounded-md border sm:block">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="p-3 text-start font-medium">{t('fmcgw1.reconProduct')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.reconActualQty')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.map((d) => (
                        <tr key={d.productId} className="border-b">
                          <td className="p-3 font-medium">{d.label}</td>
                          <td className="p-3 text-center">
                            <Input
                              type="number"
                              min={0}
                              step="0.001"
                              dir="ltr"
                              value={d.actualQty}
                              onChange={(e) => setQty(d.productId, e.target.value)}
                              className="mx-auto h-8 w-28 text-center"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="icon" onClick={() => removeLine(d.productId)} aria-label={t('fmcgw1.delete')}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="sticky bottom-2 flex justify-end">
              <Button onClick={compute} disabled={draft.length === 0}>
                <Calculator className="h-4 w-4" /> {t('fmcgw1.reconCompute')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {headers.length === 0 ? (
        <EmptyState title={t('fmcgw1.reconNoLines')} />
      ) : (
        <div className="space-y-3">
          {headers.map((h) => {
            const hl = linesByRecon.get(h.id) ?? [];
            return (
              <Card key={h.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-muted-foreground" dir="ltr">{formatDate(h.recon_date)}</span>
                      <Badge variant={STATUS_VARIANT[h.status] ?? 'secondary'}>{statusLabel(h.status)}</Badge>
                      <span className="text-sm">
                        {t('fmcgw1.reconTotalVariance')}: <span className="font-bold tabular-nums" dir="ltr">{formatCurrency(h.total_variance_value)}</span>
                      </span>
                    </div>
                    {canApprove && (h.status === 'draft' || h.status === 'pending_approval') && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => settle(h.id)}>
                          <Check className="h-4 w-4" /> {t('fmcgw1.reconSettle')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => reject(h.id)}>
                          <X className="h-4 w-4" /> {t('fmcgw1.reconReject')}
                        </Button>
                      </div>
                    )}
                  </div>

                  {hl.length > 0 && (
                    <>
                      {/* Mobile (< sm): one card per line, label↔value rows. */}
                      <div className="space-y-2 sm:hidden">
                        {hl.map((l) => (
                          <div key={l.id} className="space-y-1.5 rounded-md border p-3">
                            <p className="truncate text-sm font-medium">{l.product_id ? productLabels[l.product_id] ?? '—' : '—'}</p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
                              <span className="text-muted-foreground">{t('fmcgw1.reconExpected')}</span><span className="text-end" dir="ltr">{formatNumber(l.expected_qty)}</span>
                              <span className="text-muted-foreground">{t('fmcgw1.reconActual')}</span><span className="text-end" dir="ltr">{formatNumber(l.actual_qty)}</span>
                              <span className="text-muted-foreground">{t('fmcgw1.reconVarianceQty')}</span><span className={`text-end ${Number(l.variance_qty) !== 0 ? 'font-medium text-warning' : ''}`} dir="ltr">{formatNumber(l.variance_qty)}</span>
                              <span className="text-muted-foreground">{t('fmcgw1.reconVarianceValue')}</span><span className={`text-end ${Number(l.variance_value) !== 0 ? 'font-medium text-warning' : ''}`} dir="ltr">{formatCurrency(l.variance_value)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Desktop (sm+): table. */}
                      <div className="hidden overflow-x-auto rounded-md border sm:block">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-secondary/50 text-muted-foreground">
                            <tr>
                              <th className="p-2 text-start font-medium">{t('fmcgw1.reconProduct')}</th>
                              <th className="p-2 text-center font-medium">{t('fmcgw1.reconExpected')}</th>
                              <th className="p-2 text-center font-medium">{t('fmcgw1.reconActual')}</th>
                              <th className="p-2 text-center font-medium">{t('fmcgw1.reconVarianceQty')}</th>
                              <th className="p-2 text-center font-medium">{t('fmcgw1.reconVarianceValue')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hl.map((l) => (
                              <tr key={l.id} className="border-b">
                                <td className="p-2">{l.product_id ? productLabels[l.product_id] ?? '—' : '—'}</td>
                                <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(l.expected_qty)}</td>
                                <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(l.actual_qty)}</td>
                                <td className={`p-2 text-center tabular-nums ${Number(l.variance_qty) !== 0 ? 'text-warning font-medium' : ''}`} dir="ltr">{formatNumber(l.variance_qty)}</td>
                                <td className={`p-2 text-center tabular-nums ${Number(l.variance_value) !== 0 ? 'text-warning font-medium' : ''}`} dir="ltr">{formatCurrency(l.variance_value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
