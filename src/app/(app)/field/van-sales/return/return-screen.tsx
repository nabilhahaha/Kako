'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2, Check, Loader2, User, Printer, Share2, ArrowRight, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PendingLink } from '@/components/shared/pending-link';
import { useI18n } from '@/lib/i18n/provider';
import {
  previewVanReturn, submitVanReturn, loadReturnableInvoices, loadInvoiceReturnLines,
  type ReturnableInvoice, type ReturnLineRow,
} from '@/lib/van-sales/returns-server';
import { buildReturnReviewRows, type ReturnReviewRow } from '@/lib/van-sales/returns';
import { shareDocumentPdf } from '@/lib/pdf/share-pdf';
import { clearVisitWork } from '@/lib/van-sales/visit-session';
import { clearActiveVisit } from '@/lib/van-sales/active-visit';
import { endVisitMetrics } from '@/lib/van-sales/visit-metrics';
import { setVisitOutcome } from '@/lib/van-sales/visit-outcome';
import { recordVisitOutcome } from '@/lib/van-sales/visit-outcome-server';
import { logFieldUxEvent } from '@/lib/van-sales/ux-metrics-server';

export interface ReturnCustomer { id: string; name: string; name_ar: string | null; code: string }
export interface ReturnReason { id: string; code: string; label_en: string | null; label_ar: string | null }

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Enhanced (not replaced): same screen — Customer → Select Invoice → Reason →
// Invoice Items (Sold / Returned / Remaining) → quantity (capped at remaining) →
// Execute. The item list is the selected invoice's products only.
export function ReturnScreen({
  branchId, customers, reasons, preselectCustomerId, smartNext = false, sharePdf = false, approvalEnabled = false,
}: {
  branchId: string;
  customers: ReturnCustomer[];
  reasons: ReturnReason[];
  preselectCustomerId: string | null;
  /** Smart Next ON → after a return, the primary CTA is Next Customer. */
  smartNext?: boolean;
  /** Share-as-PDF flag ON → Share generates the Return Note PDF. */
  sharePdf?: boolean;
  /** Return Approval workflow ON → a return may be held for approval (the
   *  outcome is decided server-side by the company policy). */
  approvalEnabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();

  const preselect = preselectCustomerId && customers.some((c) => c.id === preselectCustomerId) ? preselectCustomerId : '';
  const [customerId, setCustomerId] = useState(preselect);
  const [invoiceId, setInvoiceId] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const [creditNote, setCreditNote] = useState(false);
  const [invoices, setInvoices] = useState<ReturnableInvoice[]>([]);
  const [invLines, setInvLines] = useState<ReturnLineRow[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loadingInv, setLoadingInv] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  /** Server-priced review rows (the items being returned) — shown after Review. */
  const [reviewRows, setReviewRows] = useState<ReturnReviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; returnNumber: string; creditNoteId: string | null; total: number; status: 'completed' | 'pending_approval' } | null>(null);
  const [key, setKey] = useState(() => uuid());

  const cName = (c: ReturnCustomer) => (ar && c.name_ar ? c.name_ar : c.name);
  const rName = (r: ReturnReason) => (ar && r.label_ar ? r.label_ar : r.label_en ?? r.code);
  const lName = (l: ReturnLineRow) => (ar && l.name_ar ? l.name_ar : l.name);
  // "Other" reason → reveal a free-text note (sent as the return's notes).
  const isOther = reasons.find((r) => r.id === reasonId)?.code === 'other';

  // Load the customer's returnable invoices when the customer changes.
  useEffect(() => {
    setInvoiceId(''); setInvoices([]); setInvLines([]); setQty({}); setTotal(null); setReviewRows(null);
    if (!customerId) return;
    let alive = true;
    setLoadingInv(true);
    loadReturnableInvoices(branchId, customerId)
      .then((res) => { if (alive && res.ok && res.data) setInvoices(res.data); })
      .finally(() => { if (alive) setLoadingInv(false); });
    return () => { alive = false; };
  }, [customerId, branchId]);

  // Load the selected invoice's items (Sold / Returned / Remaining).
  useEffect(() => {
    setInvLines([]); setQty({}); setTotal(null); setReviewRows(null);
    if (!invoiceId) return;
    let alive = true;
    setLoadingLines(true);
    loadInvoiceReturnLines(invoiceId)
      .then((res) => { if (alive && res.ok && res.data) setInvLines(res.data); })
      .finally(() => { if (alive) setLoadingLines(false); });
    return () => { alive = false; };
  }, [invoiceId]);

  function setQ(productId: string, raw: number, remaining: number) {
    const v = Number.isFinite(raw) ? Math.max(0, Math.min(raw, remaining)) : 0;
    setQty((m) => ({ ...m, [productId]: v }));
    // Any edit invalidates a prior review — recompute via Review again.
    setTotal(null); setReviewRows(null);
  }

  const validLines = useMemo(
    () => invLines.filter((l) => (qty[l.productId] ?? 0) > 0).map((l) => ({ product_id: l.productId, quantity: qty[l.productId] })),
    [invLines, qty],
  );

  async function preview() {
    if (!customerId || !invoiceId || validLines.length === 0) return;
    setBusy(true);
    try {
      const res = await previewVanReturn({ branch_id: branchId, customer_id: customerId, invoice_id: invoiceId, lines: validLines });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.return.error')); return; }
      // Build the review rows from the server-priced lines so the selected items
      // (name · qty · price · line total) are shown, not just the grand total.
      const names = Object.fromEntries(invLines.map((l) => [l.productId, lName(l)]));
      setReviewRows(buildReturnReviewRows(res.data.lines, names));
      setTotal(res.data.total);
    } finally { setBusy(false); }
  }

  async function submit() {
    if (!customerId) { toast.error(t('vanSales.sell.pickCustomer')); return; }
    if (!invoiceId) { toast.error(t('vanSales.return.invoiceRequired')); return; }
    if (!reasonId) { toast.error(t('vanSales.return.reasonRequired')); return; }
    if (isOther && !note.trim()) { toast.error(t('vanSales.return.noteRequired')); return; }
    if (validLines.length === 0) { toast.error(t('vanSales.return.emptyCart')); return; }
    setBusy(true);
    try {
      const res = await submitVanReturn({
        branch_id: branchId, customer_id: customerId, reason_id: reasonId, idempotency_key: key,
        invoice_id: invoiceId, create_credit_note: creditNote, notes: note.trim() || undefined, lines: validLines,
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.return.error')); return; }
      setDone({ id: res.data.id, returnNumber: res.data.returnNumber, creditNoteId: res.data.creditNoteId, total: res.data.totalAmount, status: res.data.status });
      clearVisitWork(customerId, 'return');
      if (customerId) { setVisitOutcome(customerId, 'return'); void recordVisitOutcome({ customerId, outcome: 'return' }); }
      toast.success(res.data.status === 'pending_approval'
        ? t('vanSales.return.pendingDone', { number: res.data.returnNumber })
        : t('vanSales.return.done', { number: res.data.returnNumber }));
    } finally { setBusy(false); }
  }

  async function share() {
    if (!done) return;
    // Share-as-PDF (flag ON): the Return Note PDF, identical to the print view.
    if (sharePdf) {
      try {
        await shareDocumentPdf({ doc: 'return', id: done.id, filename: `${done.returnNumber}.pdf`, title: done.returnNumber });
      } catch { toast.error(t('vanSales.sell.pdfFailed')); }
      return;
    }
    const text = t('vanSales.return.shareText', { number: done.returnNumber, amount: done.total.toFixed(2) });
    const url = typeof window !== 'undefined' ? `${window.location.origin}/sales/returns/${done.id}/print` : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: done.returnNumber, text, url }); } catch { /* cancelled */ }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} ${url}`.trim()); toast.success(t('vanSales.return.share'));
    }
  }

  if (done) {
    const pending = done.status === 'pending_approval';
    return (
      <Card>
        <CardContent className="space-y-4 pt-6 text-center">
          {pending ? (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15"><Clock className="h-6 w-6 text-warning" /></div>
          ) : (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15"><Check className="h-6 w-6 text-success" /></div>
          )}
          <div>
            <div className="text-sm text-muted-foreground">{pending ? t('vanSales.return.pendingTitle') : t('vanSales.return.completed')}</div>
            <div className="text-lg font-bold">{pending ? t('vanSales.return.pendingDone', { number: done.returnNumber }) : t('vanSales.return.done', { number: done.returnNumber })}</div>
            {pending && <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{t('vanSales.return.pendingHint')}</p>}
            {!pending && done.creditNoteId && (
              <a href={`/print/credit-note/${done.creditNoteId}`} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary underline underline-offset-2">
                {t('vanSales.return.creditNoteIssued', { number: `CN-${done.returnNumber}` })}
              </a>
            )}
          </div>
          <div className="space-y-2">
            {/* Posted return only: print/share. A pending request posts nothing yet. */}
            {!pending && (
              <div className="grid grid-cols-2 gap-2">
                <a href={`/sales/returns/${done.id}/print`} target="_blank" rel="noreferrer" className="block">
                  <Button variant="outline" className="w-full"><Printer className="h-4 w-4" /> {t('vanSales.return.print')}</Button>
                </a>
                <Button variant="outline" className="w-full" onClick={share}><Share2 className="h-4 w-4" /> {t('vanSales.return.share')}</Button>
              </div>
            )}
            {smartNext ? (
              <>
                {/* Route-first: complete the visit and move to the next customer. */}
                <PendingLink
                  href={`/field/next?done=${customerId || '1'}`}
                  onClick={() => { clearActiveVisit(); const m = endVisitMetrics(); void logFieldUxEvent({ eventType: 'visit_completed', customerId: customerId || null, meta: m ?? {} }); }}
                  pendingLabel={t('common.opening')}
                  className={`w-full ${buttonVariants({ size: 'lg' })}`}
                >
                  <ArrowRight className="h-5 w-5 rtl:rotate-180" /> {t('vanSales.sell.nextCustomer')}
                </PendingLink>
                {customerId && (
                  <PendingLink href={`/field/van-sales/statement/${customerId}`} pendingLabel={t('common.opening')} className={`w-full ${buttonVariants({ variant: 'outline' })}`}>
                    <User className="h-4 w-4" /> {t('vanSales.sell.anotherAction')}
                  </PendingLink>
                )}
              </>
            ) : (
              customerId && (
                <PendingLink href={`/field/van-sales/statement/${customerId}`} pendingLabel={t('common.opening')} className={`w-full ${buttonVariants()}`}>
                  <User className="h-4 w-4" /> {t('vanSales.sell.anotherAction')}
                </PendingLink>
              )
            )}
          </div>
          {!smartNext && <Button variant="ghost" className="w-full" onClick={() => router.push('/field/van-sales')}>{t('vanSales.return.back')}</Button>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* Customer */}
        <div className="space-y-1.5">
          <Label>{t('vanSales.return.stepCustomer')}</Label>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{t('vanSales.return.pickCustomer')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{cName(c)} · {c.code}</option>)}
          </Select>
        </div>

        {/* Invoice selector */}
        <div className="space-y-1.5">
          <Label>{t('vanSales.return.stepInvoice')}</Label>
          <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={!customerId || loadingInv}>
            <option value="">{loadingInv ? t('vanSales.return.loading') : t('vanSales.return.pickInvoice')}</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>{inv.invoiceNumber} · {inv.date} · {inv.net.toFixed(2)}</option>
            ))}
          </Select>
          {customerId && !loadingInv && invoices.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('vanSales.return.noInvoices')}</p>
          )}
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <Label>{t('vanSales.return.reason')} *</Label>
          <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
            <option value="">{t('vanSales.return.pickReason')}</option>
            {reasons.map((r) => <option key={r.id} value={r.id}>{rName(r)}</option>)}
          </Select>
          {isOther && (
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('vanSales.return.otherNote')} />
          )}
        </div>

        {/* Invoice items — Sold / Returned / Remaining + quantity (capped) */}
        <div className="space-y-2">
          <Label>{t('vanSales.return.stepProducts')}</Label>
          {!invoiceId ? (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">{t('vanSales.return.selectInvoiceFirst')}</p>
          ) : loadingLines ? (
            <div className="flex justify-center p-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <ul className="divide-y rounded-md border">
              {invLines.map((l) => {
                const q = qty[l.productId] ?? 0;
                return (
                  <li key={l.productId} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{lName(l)}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground" dir="ltr">
                        <span>{t('vanSales.return.sold')}: {l.sold}</span>
                        <span>{t('vanSales.return.returned')}: {l.returned}</span>
                        <span className="font-semibold text-foreground">{t('vanSales.return.remaining')}: {l.remaining}</span>
                      </div>
                    </div>
                    <Input
                      type="number" inputMode="numeric" min={0} max={l.remaining}
                      className="w-20 shrink-0"
                      value={q === 0 ? '' : q}
                      placeholder="0"
                      disabled={l.remaining <= 0}
                      onChange={(e) => setQ(l.productId, Math.floor(Number(e.target.value)), l.remaining)}
                      aria-label={t('vanSales.return.qty')}
                    />
                  </li>
                );
              })}
              {invLines.length === 0 && <li className="p-3 text-center text-xs text-muted-foreground">{t('vanSales.return.noInvoiceItems')}</li>}
            </ul>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={creditNote} onChange={(e) => setCreditNote(e.target.checked)} /> {t('vanSales.return.creditNote')}
        </label>

        {/* REVIEW — the selected items the rep is returning (name · qty · price ·
            line total) plus the grand total. Shown after tapping Review Return. */}
        {reviewRows != null && (
          <div className="space-y-2 rounded-md border bg-secondary/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground">{t('vanSales.return.reviewTitle')}</p>
            {reviewRows.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">{t('vanSales.return.emptyCart')}</p>
            ) : (
              <ul className="divide-y">
                {reviewRows.map((r) => (
                  <li key={r.product_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">{r.quantity} × {r.unitPrice.toFixed(2)}</span>
                    <span className="shrink-0 font-semibold tabular-nums" dir="ltr">{r.lineTotal.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
              <span>{t('vanSales.return.total')}</span><span className="tabular-nums" dir="ltr">{(total ?? 0).toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy || validLines.length === 0 || !invoiceId} onClick={preview}>
            {busy && total == null ? <Loader2 className="h-4 w-4 animate-spin" /> : t('vanSales.return.review')}
          </Button>
          <Button className="flex-[2]" disabled={busy} onClick={submit}>
            {busy
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('vanSales.return.submitting')}</>
              : <><Undo2 className="h-4 w-4" /> {approvalEnabled ? t('vanSales.return.submitForApproval') : t('vanSales.return.submit')}</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
