'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListSearch } from '@/components/list-search';
import { createReturn, completeReturn, cancelReturn, loadCustomerInvoices, loadReturnableLines, createExchange } from './actions';
import { recordMutation } from '@/lib/sync/web/write-seam';
import { submitOnlineOnly } from '@/lib/sync/web/submit-offline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FormSection } from '@/components/shared/form-section';
import { RETURN_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Branch, ErpCustomer, ProductCatalog, ReturnStatus } from '@/lib/erp/types';
import type { ReturnRow } from './page';
import { useConfirm } from '@/components/confirm-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { Plus, Loader2, X, Undo2, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<ReturnStatus, 'secondary' | 'success' | 'default' | 'destructive'> = {
  draft: 'secondary',
  approved: 'default',
  completed: 'success',
  cancelled: 'destructive',
};

interface Line {
  key: string;
  product: ProductCatalog | null;
  quantity: number;
  unit_price: number;
}
function newLine(): Line {
  return { key: Math.random().toString(36).slice(2), product: null, quantity: 1, unit_price: 0 };
}

export function ReturnsManager({
  returns,
  customers,
  branches,
  products,
  q,
}: {
  returns: ReturnRow[];
  customers: ErpCustomer[];
  branches: Branch[];
  products: ProductCatalog[];
  q: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const [creating, setCreating] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [pending, startTransition] = useTransition();

  // Invoice linkage + double-return cap
  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState<{ id: string; invoice_number: string }[]>([]);
  const [maxQty, setMaxQty] = useState<Record<string, number>>({});
  // Refund-method completion modal
  const [completeFor, setCompleteFor] = useState<ReturnRow | null>(null);
  const [refundMethod, setRefundMethod] = useState<'credit' | 'cash'>('credit');
  // Exchange
  const [exchOpen, setExchOpen] = useState(false);

  const canCreate = branches.length > 0 && customers.length > 0 && products.length > 0;

  function reset() {
    setCreating(false);
    setCustomerId('');
    setReason('');
    setLines([newLine()]);
    setInvoiceId('');
    setInvoiceOptions([]);
    setMaxQty({});
  }

  function onPickCustomer(id: string) {
    setCustomerId(id);
    setInvoiceId('');
    setInvoiceOptions([]);
    setMaxQty({});
    if (!id) return;
    startTransition(async () => {
      const res = await loadCustomerInvoices(id);
      if (res.ok && res.data) setInvoiceOptions(res.data.invoices);
    });
  }

  function onPickInvoice(id: string) {
    setInvoiceId(id);
    setMaxQty({});
    if (!id) return;
    startTransition(async () => {
      const res = await loadReturnableLines(id);
      if (!res.ok || !res.data) { toast.error(res.error ?? t('sales.errorGeneric')); return; }
      const caps: Record<string, number> = {};
      const prefilled = res.data.lines.map((l) => {
        caps[l.product_id] = l.returnable_qty;
        const p = products.find((x) => x.id === l.product_id) ?? null;
        return { key: Math.random().toString(36).slice(2), product: p, quantity: l.returnable_qty, unit_price: l.unit_price };
      });
      setMaxQty(caps);
      setLines(prefilled.length > 0 ? prefilled : [newLine()]);
    });
  }

  function pickProduct(key: string, productId: string) {
    const p = products.find((x) => x.id === productId) ?? null;
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, product: p, unit_price: p ? Number(p.sell_price) : 0 } : l)));
  }

  const total = lines.reduce((s, l) => s + (l.product ? l.quantity * l.unit_price : 0), 0);

  function onCreate() {
    startTransition(async () => {
      // Financial returns REQUIRE online connectivity (hybrid policy).
      const res = await submitOnlineOnly(() => createReturn({
        branch_id: branchId,
        customer_id: customerId,
        invoice_id: invoiceId || null,
        reason,
        lines: lines.filter((l) => l.product).map((l) => ({ product_id: l.product!.id, quantity: l.quantity, unit_price: l.unit_price })),
      }));
      if (res.offline) { toast.error(t('common.offlineRequiresOnline')); return; }
      if (!res.ok || !res.data) {
        toast.error(res.error ?? t('sales.errorGeneric'));
        return;
      }
      // Local-first journal (sales_returns = append-only). No-op unless KAKO_SYNC.
      void recordMutation({
        entity: 'sales_returns', op: 'insert', pk: res.data.id,
        payload: {
          return_id: res.data.id, branch_id: branchId, customer_id: customerId, invoice_id: invoiceId || null, reason,
          lines: lines.filter((l) => l.product).map((l) => ({ product_id: l.product!.id, quantity: l.quantity, unit_price: l.unit_price })),
        },
      });
      toast.success(t('sales.returnSuccessCreated'));
      reset();
      router.refresh();
    });
  }

  function onComplete(r: ReturnRow) {
    setRefundMethod('credit');
    setCompleteFor(r);
  }

  function doComplete() {
    if (!completeFor) return;
    const id = completeFor.id;
    const method = refundMethod;
    startTransition(async () => {
      const res = await submitOnlineOnly(() => completeReturn(id, method));
      if (res.offline) { toast.error(t('common.offlineRequiresOnline')); return; }
      if (!res.ok) {
        toast.error(res.error ?? t('sales.errorGeneric'));
        return;
      }
      // Status transition on the append-only return document. No-op unless KAKO_SYNC.
      void recordMutation({ entity: 'sales_returns', op: 'update', pk: id, payload: { return_id: id, status: 'completed', refund_method: method } });
      toast.success(t('sales.returnSuccessApproved'));
      setCompleteFor(null);
      router.refresh();
    });
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: t('sales.returnConfirmCancelTitle'),
      confirmText: t('sales.returnConfirmCancelBtn'),
      cancelText: t('sales.btnBack'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelReturn(id);
      if (!res.ok) {
        toast.error(res.error ?? t('sales.errorGeneric'));
        return;
      }
      toast.success(t('sales.returnSuccessCancelled'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> {t('sales.returnBtnNew')}
        </Button>
      )}
      {!canCreate && !creating && (
        <p className="text-sm text-warning">{t('sales.returnNeedData')}</p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('sales.returnFormTitle')}</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <FormSection title={t('sales.returnDetailsSection')}>
              {branches.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">{t('sales.labelBranchRequired')}</Label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t('sales.labelCustomerRequired')}</Label>
                <select value={customerId} onChange={(e) => onPickCustomer(e.target.value)} className={selectCls}>
                  <option value="">{t('sales.placeholderChooseCustomer')}</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>)}
                </select>
              </div>
              {customerId && (
                <div className="space-y-1">
                  <Label className="text-xs">{t('sales.returnLabelInvoice')}</Label>
                  <select value={invoiceId} onChange={(e) => onPickInvoice(e.target.value)} className={selectCls}>
                    <option value="">{t('sales.returnInvoiceNone')}</option>
                    {invoiceOptions.map((iv) => <option key={iv.id} value={iv.id}>{iv.invoice_number}</option>)}
                  </select>
                  {invoiceId && <p className="text-[11px] text-muted-foreground">{t('sales.returnInvoiceHint')}</p>}
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t('sales.returnLabelReason')}</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('sales.returnReasonPlaceholder')} />
              </div>
            </FormSection>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start font-medium">{t('sales.returnColProduct')}</th>
                    <th className="p-2 text-center font-medium w-24">{t('sales.returnColQty')}</th>
                    <th className="p-2 text-center font-medium w-28">{t('sales.returnColUnitPrice')}</th>
                    <th className="p-2 text-end font-medium w-28">{t('sales.returnColTotal')}</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-b last:border-0">
                      <td className="p-2">
                        <select value={l.product?.id ?? ''} onChange={(e) => pickProduct(l.key, e.target.value)} className="h-9 w-full min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm">
                          <option value="">{t('sales.placeholderChooseProduct')}</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name_ar || p.name}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <Input type="number" step="0.001" min="0" dir="ltr" value={l.quantity}
                          max={l.product && maxQty[l.product.id] !== undefined ? maxQty[l.product.id] : undefined}
                          onChange={(e) => {
                            let v = Number(e.target.value);
                            const cap = l.product ? maxQty[l.product.id] : undefined;
                            if (cap !== undefined && v > cap) { v = cap; toast.error(t('sales.returnQtyCapped', { max: cap })); }
                            setLines(lines.map((x) => x.key === l.key ? { ...x, quantity: v } : x));
                          }} className="h-9 text-center" />
                      </td>
                      <td className="p-2">
                        <Input type="number" step="0.01" min="0" dir="ltr" value={l.unit_price}
                          onChange={(e) => setLines(lines.map((x) => x.key === l.key ? { ...x, unit_price: Number(e.target.value) } : x))} className="h-9 text-center" />
                      </td>
                      <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(l.quantity * l.unit_price)}</td>
                      <td className="p-2">
                        <button type="button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, newLine()])}>
                <Plus className="h-4 w-4" /> {t('sales.returnBtnAddLine')}
              </Button>
              <div className="text-sm font-bold">
                {t('sales.returnTotal')}: <span dir="ltr" className="tabular-nums">{formatCurrency(total, 'EGP', INTL_LOCALE[locale])}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('sales.returnBtnSave')}
              </Button>
              <Button variant="outline" onClick={reset}>{t('sales.btnCancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {returns.length === 0 && !q ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <Undo2 className="h-8 w-8" />
            <p>{t('sales.returnEmpty')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <ListSearch placeholder={t('sales.returnSearchPlaceholder')} className="w-64" />
            </div>
            {returns.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{t('sales.noResults')}</p>
            ) : (
            <>
            {/* Mobile (UX-3): cards instead of a wide horizontal-scroll table */}
            <div className="divide-y sm:hidden">
              {returns.map((r) => (
                <div key={r.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.customer?.name_ar || r.customer?.name || '—'}</p>
                      <p className="font-mono text-xs text-muted-foreground" dir="ltr">{r.return_number}</p>
                    </div>
                    <Badge variant={STATUS_VARIANT[r.status]}>{RETURN_STATUS_LABELS[r.status][locale]}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {r.reason && <span>{r.reason}</span>}
                    <span>{formatDate(r.created_at, INTL_LOCALE[locale])}</span>
                    <span dir="ltr" className="tabular-nums">{t('sales.returnColValue')}: {formatCurrency(r.total_amount, 'EGP', INTL_LOCALE[locale])}</span>
                  </div>
                  {(r.status === 'draft' || r.status === 'approved') && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => onComplete(r)} className="text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {t('sales.returnBtnApprove')}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(r.id)} className="text-xs text-destructive">
                        {t('sales.returnBtnCancel')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('sales.returnColNumber')}</th>
                    <th className="p-3 text-start font-medium">{t('sales.returnColCustomer')}</th>
                    <th className="p-3 text-start font-medium">{t('sales.returnColReason')}</th>
                    <th className="p-3 text-start font-medium">{t('sales.returnColDate')}</th>
                    <th className="p-3 text-end font-medium">{t('sales.returnColValue')}</th>
                    <th className="p-3 text-center font-medium">{t('sales.returnColStatus')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{r.return_number}</td>
                      <td className="p-3 font-medium">{r.customer?.name_ar || r.customer?.name || '—'}</td>
                      <td className="p-3 text-muted-foreground">{r.reason || '—'}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(r.created_at, INTL_LOCALE[locale])}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(r.total_amount, 'EGP', INTL_LOCALE[locale])}</td>
                      <td className="p-3 text-center">
                        <Badge variant={STATUS_VARIANT[r.status]}>{RETURN_STATUS_LABELS[r.status][locale]}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {(r.status === 'draft' || r.status === 'approved') && (
                            <>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onComplete(r)} className="text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" /> {t('sales.returnBtnApprove')}
                              </Button>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(r.id)} className="text-xs text-destructive">
                                {t('sales.returnBtnCancel')}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Exchange */}
      {!creating && (
        <ExchangeCard
          open={exchOpen}
          onToggle={() => setExchOpen((v) => !v)}
          customers={customers}
          products={products}
          onDone={() => router.refresh()}
        />
      )}

      {/* Refund-method completion modal */}
      {completeFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => !pending && setCompleteFor(null)}>
          <div className="w-full max-w-md rounded-t-xl bg-card p-5 shadow-xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 font-semibold">{t('sales.returnCompleteTitle')}</h3>
            <p className="mb-3 text-sm text-muted-foreground">{t('sales.returnCompleteMsg', { number: completeFor.return_number })}</p>
            <Label className="text-xs text-muted-foreground">{t('sales.refundMethodLabel')}</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['credit', 'cash'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setRefundMethod(m)}
                  className={`rounded-md border p-2 text-sm ${refundMethod === m ? 'border-primary bg-primary/5 font-medium' : ''}`}>
                  {t(m === 'credit' ? 'sales.refundCredit' : 'sales.refundCash')}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" disabled={pending} onClick={() => setCompleteFor(null)}>{t('sales.btnBack')}</Button>
              <Button disabled={pending} onClick={doComplete} className="gap-1.5">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {t('sales.returnBtnApprove')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Exchange: return an item and sell a replacement in one audited workflow. */
function ExchangeCard({
  open,
  onToggle,
  customers,
  products,
  onDone,
}: {
  open: boolean;
  onToggle: () => void;
  customers: ErpCustomer[];
  products: ProductCatalog[];
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState<{ id: string; invoice_number: string }[]>([]);
  const [returnable, setReturnable] = useState<{ product_id: string; returnable_qty: number; unit_price: number }[]>([]);
  const [returnedProduct, setReturnedProduct] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [newProduct, setNewProduct] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newPrice, setNewPrice] = useState(0);
  const [settle, setSettle] = useState<'cash' | 'credit'>('cash');
  const [pending, startTransition] = useTransition();

  function pickCustomer(id: string) {
    setCustomerId(id); setInvoiceId(''); setInvoiceOptions([]); setReturnable([]); setReturnedProduct('');
    if (!id) return;
    startTransition(async () => {
      const res = await loadCustomerInvoices(id);
      if (res.ok && res.data) setInvoiceOptions(res.data.invoices);
    });
  }
  function pickInvoice(id: string) {
    setInvoiceId(id); setReturnable([]); setReturnedProduct('');
    if (!id) return;
    startTransition(async () => {
      const res = await loadReturnableLines(id);
      if (res.ok && res.data) setReturnable(res.data.lines);
    });
  }
  function submit() {
    confirm({ title: t('sales.exchSubmit'), message: t('sales.exchConfirmMsg'), confirmText: t('sales.exchSubmit') }).then((ok) => {
    if (!ok) return;
    startTransition(async () => {
      const res = await createExchange({
        invoice_id: invoiceId, returned_product_id: returnedProduct, return_qty: returnQty,
        new_product_id: newProduct, new_qty: newQty, new_unit_price: newPrice, settle_method: settle,
      });
      if (!res.ok) { toast.error(res.error ?? t('sales.errorGeneric')); return; }
      const diff = res.data?.price_difference ?? 0;
      toast.success(t('sales.exchSuccess', { diff: formatCurrency(diff, 'EGP', INTL_LOCALE[locale]) }));
      setReturnedProduct(''); setNewProduct(''); setReturnQty(1); setNewQty(1); setNewPrice(0);
      onDone();
    });
    });
  }

  const cap = returnable.find((r) => r.product_id === returnedProduct)?.returnable_qty;

  return (
    <Card>
      <CardContent className="p-0">
        <button onClick={onToggle} className="flex w-full items-center justify-between p-4 text-start font-semibold">
          <span className="flex items-center gap-2"><Undo2 className="h-4 w-4" /> {t('sales.exchTitle')}</span>
          <span className="text-xs text-muted-foreground">{open ? '−' : '+'}</span>
        </button>
        {open && (
          <div className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('sales.labelCustomerRequired')}</span>
              <select className={selectCls} value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">{t('sales.placeholderChooseCustomer')}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('sales.returnLabelInvoice')}</span>
              <select className={selectCls} value={invoiceId} onChange={(e) => pickInvoice(e.target.value)} disabled={!customerId}>
                <option value="">—</option>
                {invoiceOptions.map((iv) => <option key={iv.id} value={iv.id}>{iv.invoice_number}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('sales.exchReturnedProduct')}</span>
              <select className={selectCls} value={returnedProduct} onChange={(e) => setReturnedProduct(e.target.value)} disabled={!invoiceId}>
                <option value="">—</option>
                {returnable.map((r) => {
                  const p = products.find((x) => x.id === r.product_id);
                  return <option key={r.product_id} value={r.product_id}>{p ? (p.name_ar || p.name) : r.product_id} ({t('sales.exchAvail', { qty: r.returnable_qty })})</option>;
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('sales.exchReturnQty')}{cap !== undefined ? ` (≤ ${cap})` : ''}</span>
              <Input type="number" min="0" step="0.001" dir="ltr" value={returnQty} onChange={(e) => setReturnQty(Math.min(Number(e.target.value), cap ?? Infinity))} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('sales.exchNewProduct')}</span>
              <select className={selectCls} value={newProduct} onChange={(e) => { setNewProduct(e.target.value); const p = products.find((x) => x.id === e.target.value); if (p) setNewPrice(Number(p.sell_price)); }}>
                <option value="">—</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name_ar || p.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('sales.exchNewQty')}</span>
              <Input type="number" min="0" step="0.001" dir="ltr" value={newQty} onChange={(e) => setNewQty(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('sales.exchNewPrice')}</span>
              <Input type="number" min="0" step="0.01" dir="ltr" value={newPrice} onChange={(e) => setNewPrice(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('sales.exchSettle')}</span>
              <select className={selectCls} value={settle} onChange={(e) => setSettle(e.target.value as 'cash' | 'credit')}>
                <option value="cash">{t('sales.refundCash')}</option>
                <option value="credit">{t('sales.refundCredit')}</option>
              </select>
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <Button onClick={submit} disabled={pending || !invoiceId || !returnedProduct || !newProduct} className="gap-1.5">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                {t('sales.exchSubmit')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
