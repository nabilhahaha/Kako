'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Loader2, Clock, ChevronDown, ChevronUp, User } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { pendingBucket, pendingAgeHours } from '@/lib/van-sales/return-sla';
import { decideDayCloseStage, loadDayCloseReview, type PendingDayCloseRow, type DayCloseReview } from '@/lib/van-sales/day-close-server';
import type { DayCloseStage } from '@/lib/van-sales/day-close-policy';

const STAGE_KEY: Record<string, string> = { supervisor: 'stSupervisor', reconcile: 'stReconcile', settle: 'stSettle' };

/** End Day approval queue: each held request shows the salesman, work date, current
 *  stage, and SLA age; an actor for that stage can Approve / Reject (reason required,
 *  optional comment and variance). Decided rows drop out. */
export function DayCloseQueue({ items, actableStages }: { items: PendingDayCloseRow[]; actableStages: DayCloseStage[] }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const now = new Date();
  const [rows, setRows] = useState(items);
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [actual, setActual] = useState('');         // counted stock units OR actual cash
  const [review, setReview] = useState<DayCloseReview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [busy, setBusy] = useState<'' | 'approve' | 'reject'>('');
  const dl = (k: string) => t(`vanSales.dayClose.${k}`);

  function openRow(r: PendingDayCloseRow) {
    if (open === r.id) { setOpen(null); return; }
    setOpen(r.id); setReason(''); setComment(''); setActual(''); setReview(null);
    if (r.stage === 'reconcile' || r.stage === 'settle') {
      setReviewBusy(true);
      loadDayCloseReview(r.id).then((res) => { if (res.ok && res.data) setReview(res.data); }).finally(() => setReviewBusy(false));
    }
  }

  // Expected figure for the open stage (closing stock units or expected cash).
  function expectedFor(stage: DayCloseStage | null): number | null {
    if (!review) return null;
    return stage === 'reconcile' ? review.expectedStockUnits : stage === 'settle' ? review.expectedCash : null;
  }

  async function decide(r: PendingDayCloseRow, decision: 'approve' | 'reject') {
    if (!r.stage) return;
    if (decision === 'reject' && !reason.trim()) { toast.error(dl('reasonRequired')); return; }
    // Variance = expected − actual (counted stock / actual cash), when entered.
    const expected = expectedFor(r.stage);
    const variance = (decision === 'approve' && expected != null && actual.trim() !== '')
      ? Math.round((expected - Number(actual)) * 1000) / 1000 : undefined;
    setBusy(decision);
    try {
      const res = await decideDayCloseStage({
        requestId: r.id, stage: r.stage, decision,
        reason: reason.trim() || undefined, comment: comment.trim() || undefined,
        variance,
      });
      if (!res.ok) { toast.error(res.error ?? dl('error')); return; }
      setRows((list) => list.filter((x) => x.id !== r.id));
      setOpen(null); setReason(''); setComment(''); setActual(''); setReview(null);
      toast.success(res.data?.status === 'closed' ? dl('closedToast') : decision === 'approve' ? dl('approvedToast') : dl('rejectedToast'));
    } finally { setBusy(''); }
  }

  if (rows.length === 0) {
    return <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">{dl('empty')}</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const bucket = pendingBucket(r.submittedAt, now);
        const ageH = Math.floor(pendingAgeHours(r.submittedAt, now) ?? 0);
        const canAct = r.stage != null && actableStages.includes(r.stage);
        const isOpen = open === r.id;
        const isReconcileOrSettle = r.stage === 'reconcile' || r.stage === 'settle';
        return (
          <Card key={r.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.salesmanName}</span>
                    <Badge variant="secondary" className="shrink-0">{dl(STAGE_KEY[r.stage ?? 'supervisor'])}</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground" dir="ltr">
                    <User className="h-3 w-3" /> {r.workDate ?? '—'}
                  </div>
                </div>
                <Badge variant={bucket === 'over_48h' ? 'destructive' : bucket === 'over_24h' ? 'warning' : 'outline'} className="shrink-0 gap-1">
                  <Clock className="h-3 w-3" /> {ageH >= 48 ? dl('ageDays').replace('{d}', (ageH / 24).toFixed(1)) : dl('ageHours').replace('{h}', String(ageH))}
                </Badge>
              </div>

              {(r.stockVariance != null || r.cashVariance != null) && (
                <div className="flex flex-wrap gap-3 text-xs" dir="ltr">
                  {r.stockVariance != null && <span className="text-muted-foreground">{dl('stockVariance')}: <b className="text-foreground tabular-nums">{r.stockVariance}</b></span>}
                  {r.cashVariance != null && <span className="text-muted-foreground">{dl('cashVariance')}: <b className="text-foreground tabular-nums">{r.cashVariance.toLocaleString(intl)}</b></span>}
                </div>
              )}

              {canAct ? (
                <>
                  <button type="button" onClick={() => openRow(r)} className="flex items-center gap-1 text-xs font-medium text-primary">
                    {isOpen ? <><ChevronUp className="h-3.5 w-3.5" /> {dl('hide')}</> : <><ChevronDown className="h-3.5 w-3.5" /> {dl('review')}</>}
                  </button>
                  {isOpen && (
                    <div className="space-y-3 rounded-md border bg-secondary/20 p-3">
                      {isReconcileOrSettle && (
                        <div className="space-y-2 rounded-md bg-background p-2.5">
                          {reviewBusy && !review ? (
                            <div className="flex justify-center py-1"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between text-xs" dir="ltr">
                                <span className="text-muted-foreground">{r.stage === 'settle' ? dl('expectedCash') : dl('expectedStock')}</span>
                                <b className="tabular-nums">{r.stage === 'settle'
                                  ? (review?.expectedCash ?? 0).toLocaleString(intl)
                                  : `${review?.expectedStockUnits ?? 0} (${review?.skuCount ?? 0} ${dl('skus')})`}</b>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{r.stage === 'settle' ? dl('actualCash') : dl('countedStock')}</Label>
                                <Input type="number" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0" />
                              </div>
                              {actual.trim() !== '' && expectedFor(r.stage) != null && (
                                <div className="flex items-center justify-between text-xs" dir="ltr">
                                  <span className="text-muted-foreground">{r.stage === 'settle' ? dl('cashVariance') : dl('stockVariance')}</span>
                                  <b className={`tabular-nums ${Math.abs((expectedFor(r.stage) ?? 0) - Number(actual)) > 0 ? 'text-destructive' : 'text-success'}`}>
                                    {((expectedFor(r.stage) ?? 0) - Number(actual)).toLocaleString(intl)}
                                  </b>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-xs">{dl('comment')} <span className="text-muted-foreground">({dl('optional')})</span></Label>
                        <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={dl('commentPlaceholder')} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{dl('reason')} <span className="text-muted-foreground">({dl('rejectOnly')})</span></Label>
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={dl('reasonPlaceholder')} />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy !== ''} onClick={() => decide(r, 'reject')}>
                          {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4" /> {dl('reject')}</>}
                        </Button>
                        <Button className="flex-[2]" disabled={busy !== ''} onClick={() => decide(r, 'approve')}>
                          {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> {dl('approve')}</>}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{dl('notYourStage')}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
