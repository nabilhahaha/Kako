'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListSearch } from '@/components/list-search';
import { createInvoice, issueInvoice, recordPayment, cancelInvoice, submitInvoiceToEta } from './actions';
import { resolveLinePrice } from '../pricing/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FormSection } from '@/components/shared/form-section';
import { LineItemsEditor, newLine, type EditorLine } from '@/components/sales/line-items-editor';
import { EmptyState } from '@/components/shared/empty-state';
import { FieldError } from '@/components/ui/field-error';
import { Tooltip } from '@/components/ui/tooltip';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_OPTIONS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Branch, ErpCustomer, InvoiceStatus, PaymentMethod, ProductCatalog } from '@/lib/erp/types';
import type { InvoiceRow } from './page';
import { useConfirm } from '@/components/confirm-dialog';
import { useCriticalAction } from '@/lib/critical-action';
import { useI18n } from '@/lib/i18n/provider';
import Link from 'next/link';
import { Plus, Loader2, X, Receipt, CheckCircle2, Wallet, Printer } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<InvoiceStatus, 'secondary' | 'success' | 'default' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  issued: 'default',
  paid: 'success',
  partially_paid: 'warning',
  cancelled: 'destructive',
  overdue: 'warning',
};

export function InvoicesManager({
  invoices,
  customers,
  branches,
  products,
  q,
  status,
  etaEnabled = false,
}: {
  invoices: InvoiceRow[];
  customers: ErpCustomer[];
  branches: Branch[];
  products: ProductCatalog[];
  q: string;
  status: string;
  etaEnabled?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const runCritical = useCriticalAction();
  const { t, locale } = useI18n();
  const [creating, setCreating] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);
  const [errors, setErrors] = useState<{ customer?: string; lines?: string }>({});
  const [pending, startTransition] = useTransition();

  const canCreate = branches.length > 0 && customers.length > 0 && products.length > 0;
  const hasFilter = Boolean(q) || status !== 'all';

  const statusHref = (val: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (val !== 'all') params.set('status', val);
    const qs = params.toString();
    return qs ? `/sales/invoices?${qs}` : '/sales/invoices';
  };

  function reset() {
    setCreating(false);
    setCustomerId('');
    setDueDate('');
    setNotes('');
    setLines([newLine()]);
    setErrors({});
  }

  function onCreate() {
    // Inline validation before hitting the server.
    const next: { customer?: string; lines?: string } = {};
    if (!customerId) next.customer = t('sales.invoiceErrSelectCustomer');
    const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (validLines.length === 0) next.lines = t('sales.invoiceErrNeedLine');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    startTransition(async () => {
      const res = await createInvoice({
        branch_id: branchId,
        customer_id: customerId,
        due_date: dueDate,
        notes,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          tax_rate: l.tax_rate,
        })),
      });
      if (!res.ok) {
        toast.error(res.error ?? t('sales.errorGeneric'));
        return;
      }
      toast.success(t('sales.invoiceSuccessCreated'));
      reset();
      router.refresh();
    });
  }

  // Invoice finalization — irreversible (stock-out + AR posting).
  async function onIssue(id: string) {
    const inv = invoices.find((x) => x.id === id);
    await runCritical({
      catalogKey: 'invoice.finalize',
      action: t('critical.actions.invoiceFinalize'),
      record: inv?.invoice_number ?? id,
      execute: async () => {
        const res = await issueInvoice(id);
        return { ok: res.ok, error: res.error };
      },
      onDone: () => router.refresh(),
    });
  }

  function onSubmitEta(id: string) {
    startTransition(async () => {
      const res = await submitInvoiceToEta(id);
      if (!res.ok) {
        toast.error(res.error ?? t('sales.etaSubmitFailed'));
        return;
      }
      toast.success(t('sales.etaSubmitted'));
      router.refresh();
    });
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: t('sales.invoiceConfirmCancelTitle'),
      message: t('sales.invoiceConfirmCancelMsg'),
      confirmText: t('sales.invoiceConfirmCancelBtn'),
      cancelText: t('sales.btnBack'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelInvoice(id);
      if (!res.ok) {
        toast.error(res.error ?? t('sales.errorGeneric'));
        return;
      }
      toast.success(t('sales.invoiceSuccessCancelled'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> {t('sales.invoiceBtnNew')}
        </Button>
      )}
      {!canCreate && !creating && (
        <p className="text-sm text-warning">
          {t('sales.invoiceNeedData')}
        </p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('sales.invoiceFormTitle')}</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <FormSection title={t('sales.invoiceDetailsSection')}>
              {branches.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">{t('sales.labelBranchRequired')}</Label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t('sales.labelCustomerRequired')}</Label>
                <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setErrors((x) => ({ ...x, customer: undefined })); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t('sales.placeholderChooseCustomer')}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>
                  ))}
                </select>
                <FieldError>{errors.customer}</FieldError>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('sales.invoiceLabelDueDate')}</Label>
                <Input type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('sales.labelNotes')}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </FormSection>

            <LineItemsEditor
              products={products}
              lines={lines}
              onChange={(l) => { setLines(l); setErrors((x) => ({ ...x, lines: undefined })); }}
              priceResolver={customerId ? (productId, qty) => resolveLinePrice({ productId, customerId, branchId, qty }) : undefined}
            />
            <FieldError>{errors.lines}</FieldError>

            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('sales.invoiceBtnSaveDraft')}
              </Button>
              <Button variant="outline" onClick={reset}>{t('sales.btnCancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {invoices.length === 0 && !hasFilter ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={<Receipt />}
              title={t('sales.invoiceEmpty')}
              action={canCreate && !creating ? (
                <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> {t('sales.invoiceBtnNew')}</Button>
              ) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <ListSearch placeholder={t('sales.invoiceSearchPlaceholder')} className="w-64" />
              <div className="flex flex-wrap gap-1">
                {([['all', t('sales.invoiceFilterAll')], ['draft', t('sales.invoiceFilterDraft')], ['issued', t('sales.invoiceFilterIssued')], ['partially_paid', t('sales.invoiceFilterPartiallyPaid')], ['paid', t('sales.invoiceFilterPaid')], ['overdue', t('sales.invoiceFilterOverdue')], ['cancelled', t('sales.invoiceFilterCancelled')]] as const).map(
                  ([val, lbl]) => (
                    <Link
                      key={val}
                      href={statusHref(val)}
                      className={`rounded-full px-3 py-1 text-xs ${status === val ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                    >
                      {lbl}
                    </Link>
                  ),
                )}
              </div>
            </div>
            {invoices.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{t('sales.noResults')}</p>
            ) : (
            <>
            {/* Mobile (UX-5): invoice cards instead of a wide table */}
            <div className="divide-y sm:hidden">
              {invoices.map((inv) => {
                const remaining = Number(inv.net_amount) - Number(inv.paid_amount);
                const canPay = ['issued', 'partially_paid', 'overdue'].includes(inv.status) && remaining > 0.001;
                return (
                  <div key={inv.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{inv.customer?.name_ar || inv.customer?.name || '—'}</p>
                        <p className="font-mono text-xs text-muted-foreground" dir="ltr">{inv.invoice_number} · {formatDate(inv.created_at, INTL_LOCALE[locale])}</p>
                      </div>
                      <Badge variant={STATUS_VARIANT[inv.status]}>{INVOICE_STATUS_LABELS[inv.status][locale]}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" dir="ltr">
                      <span>{t('sales.invoiceColNet')}: <span className="tabular-nums text-foreground">{formatCurrency(inv.net_amount, 'EGP', INTL_LOCALE[locale])}</span></span>
                      <span>{t('sales.invoiceColRemaining')}: <span className="tabular-nums">{formatCurrency(remaining, 'EGP', INTL_LOCALE[locale])}</span></span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Link href={`/print/invoices/${inv.id}`} target="_blank" className="rounded-md p-2 hover:bg-secondary" aria-label={t('sales.invoicePrint')}>
                        <Printer className="h-4 w-4" />
                      </Link>
                      {inv.status === 'draft' && (
                        <>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onIssue(inv.id)} className="text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {t('sales.invoiceBtnIssue')}
                          </Button>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(inv.id)} className="text-xs text-destructive">
                            {t('sales.invoiceBtnCancel')}
                          </Button>
                        </>
                      )}
                      {canPay && (
                        <Button variant="ghost" size="sm" onClick={() => setPayFor(inv)} className="text-xs">
                          <Wallet className="h-3.5 w-3.5" /> {t('sales.paymentBtnCollect')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('sales.invoiceColNumber')}</th>
                    <th className="p-3 text-start font-medium">{t('sales.invoiceColCustomer')}</th>
                    <th className="p-3 text-start font-medium">{t('sales.invoiceColDate')}</th>
                    <th className="p-3 text-end font-medium">{t('sales.invoiceColNet')}</th>
                    <th className="p-3 text-end font-medium">{t('sales.invoiceColPaid')}</th>
                    <th className="p-3 text-end font-medium">{t('sales.invoiceColRemaining')}</th>
                    <th className="p-3 text-center font-medium">{t('sales.invoiceColStatus')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const remaining = Number(inv.net_amount) - Number(inv.paid_amount);
                    const canPay = ['issued', 'partially_paid', 'overdue'].includes(inv.status) && remaining > 0.001;
                    return (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="p-3 font-mono text-xs" dir="ltr">{inv.invoice_number}</td>
                        <td className="p-3 font-medium">{inv.customer?.name_ar || inv.customer?.name || '—'}</td>
                        <td className="p-3 text-muted-foreground">{formatDate(inv.created_at, INTL_LOCALE[locale])}</td>
                        <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(inv.net_amount, 'EGP', INTL_LOCALE[locale])}</td>
                        <td className="p-3 text-left tabular-nums text-success" dir="ltr">{formatCurrency(inv.paid_amount, 'EGP', INTL_LOCALE[locale])}</td>
                        <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(remaining, 'EGP', INTL_LOCALE[locale])}</td>
                        <td className="p-3 text-center">
                          <Badge variant={STATUS_VARIANT[inv.status]}>{INVOICE_STATUS_LABELS[inv.status][locale]}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Tooltip label={t('sales.invoicePrint')}>
                              <Link href={`/print/invoices/${inv.id}`} target="_blank" className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('sales.invoicePrint')}>
                                <Printer className="h-4 w-4" />
                              </Link>
                            </Tooltip>
                            {etaEnabled && inv.status !== 'draft' && inv.eta_status === 'not_submitted' && (
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onSubmitEta(inv.id)} className="text-xs">
                                {t('sales.etaSubmit')}
                              </Button>
                            )}
                            {etaEnabled && inv.eta_status === 'submitted' && (
                              <Badge variant="secondary" className="text-[10px]">{t('sales.etaStatusSubmitted')}</Badge>
                            )}
                            {etaEnabled && inv.eta_status === 'valid' && (
                              <Badge variant="success" className="text-[10px]">{t('sales.etaStatusValid')}</Badge>
                            )}
                            {etaEnabled && (inv.eta_status === 'rejected' || inv.eta_status === 'invalid') && (
                              <Badge variant="destructive" className="text-[10px]">{t('sales.etaStatusRejected')}</Badge>
                            )}
                            {inv.status === 'draft' && (
                              <>
                                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onIssue(inv.id)} className="text-xs">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> {t('sales.invoiceBtnIssue')}
                                </Button>
                                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(inv.id)} className="text-xs text-destructive">
                                  {t('sales.invoiceBtnCancel')}
                                </Button>
                              </>
                            )}
                            {canPay && (
                              <>
                                <WhatsAppButton
                                  phone={inv.customer?.phone}
                                  label={t('sales.invoiceWhatsAppReminder')}
                                  message={t('sales.invoiceWhatsAppMsg', { customer: inv.customer?.name_ar || inv.customer?.name || '', number: inv.invoice_number, amount: formatCurrency(remaining, 'EGP', INTL_LOCALE[locale]) })}
                                />
                                <Button variant="ghost" size="sm" onClick={() => setPayFor(inv)} className="text-xs">
                                  <Wallet className="h-3.5 w-3.5" /> {t('sales.paymentBtnCollect')}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
            )}
          </CardContent>
        </Card>
      )}

      {payFor && (
        <PaymentDialog
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onDone={() => {
            setPayFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PaymentDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const remaining = Number(invoice.net_amount) - Number(invoice.paid_amount);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  // Stable per-dialog idempotency key — a retry (e.g. lost response) reuses it,
  // so the payment is never recorded twice.
  const [idemKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await recordPayment({
        invoice_id: invoice.id,
        amount: Number(amount),
        payment_method: method,
        reference_number: ref,
        payment_date: date,
        idempotency_key: idemKey,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('sales.errorGeneric'));
        return;
      }
      toast.success(t('sales.paymentSuccess'));
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('sales.paymentDialogTitle', { number: invoice.invoice_number })}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('sales.paymentLabelRemaining')}: <span dir="ltr" className="font-semibold tabular-nums">{formatCurrency(remaining, 'EGP', INTL_LOCALE[locale])}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('sales.paymentLabelAmount')}</Label>
              <Input type="number" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('sales.paymentLabelMethod')}</Label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m[locale]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('sales.paymentLabelRef')}</Label>
              <Input dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('sales.labelDate')}</Label>
              <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('sales.paymentBtnConfirm')}
            </Button>
            <Button variant="outline" onClick={onClose}>{t('sales.btnCancel')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
