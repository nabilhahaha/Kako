'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ShoppingCart, Plus, Minus, ArrowLeft, ArrowRight, Search, Check,
  Printer, Share2, ReceiptText, CloudOff, Loader2, User, Wallet, Trash2, HandCoins, FileText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { PendingLink } from '@/components/shared/pending-link';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { setVisitOutcome } from '@/lib/van-sales/visit-outcome';
import { recordVisitOutcome } from '@/lib/van-sales/visit-outcome-server';
import { useI18n } from '@/lib/i18n/provider';
import { useOnlineStatus } from '@/lib/offline-sync/use-network';
import {
  firstDiscountOverCap, PAYMENT_METHODS, REFERENCE_REQUIRED_METHODS,
  sumTenders, paymentStatusFor, outstandingAfter, newBalanceAfter, validateTenders,
  availableCreditFor, creditBlocked, isOverdueBlocked, overdueDays, creditStatusOf, creditStandingBlocked,
  type PaymentMethod, type PaymentTender, type CreditStatus,
} from '@/lib/van-sales/sell';
import { previewVanSale, vanSell, vanSellWithPayment, type VanSellPreview } from '@/lib/van-sales/sell-server';
import { clearVisitWork } from '@/lib/van-sales/visit-session';

export interface SellCustomer {
  id: string; name: string; name_ar: string | null; code: string; balance: number; credit_limit: number;
  /** Credit-control inputs for the in-sell guard (Phase 1). */
  payment_terms_days?: number | null;
  credit_control_enabled?: boolean | null;
  /** Oldest unpaid invoice date (yyyy-mm-dd) for overdue detection; null = none open. */
  oldest_unpaid_date?: string | null;
  /** Debt snapshot for the blocked-customer summary. */
  open_invoice_count?: number | null;
  overdue_amount?: number | null;
}
export interface SellProduct {
  id: string; name: string; name_ar: string | null; code: string; available: number;
  /** U3: sellable units (base + alternates) for the per-line UoM picker. */
  units?: { uom: string; factor: number }[];
  defaultSellUom?: string | null;
}

interface CartLine { productId: string; quantity: number; discount_pct: number; uom?: string | null }
type Step = 'customer' | 'products' | 'review' | 'payment' | 'done';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function SellScreen({
  branchId, customers, products, preselectCustomerId, discountCapPct, canDiscount, offlineEnabled, multiUom = false,
  collectInSell = false, canCollect = false, smartNext = false,
}: {
  branchId: string;
  customers: SellCustomer[];
  products: SellProduct[];
  preselectCustomerId: string | null;
  discountCapPct: number | null;
  canDiscount: boolean;
  offlineEnabled: boolean;
  multiUom?: boolean;
  /** Collection-in-Sell flag ON for the tenant → show the Payment step. */
  collectInSell?: boolean;
  /** Rep holds sales.collect → may enter tenders; otherwise credit-only. */
  canCollect?: boolean;
  /** Smart Next Customer ON → after a sale, primary CTA is Next Customer. */
  smartNext?: boolean;
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const online = useOnlineStatus();

  const preselect = preselectCustomerId && customers.some((c) => c.id === preselectCustomerId) ? preselectCustomerId : null;
  const [customerId, setCustomerId] = useState<string | null>(preselect);
  const [step, setStep] = useState<Step>(preselect ? 'products' : 'customer');
  const [custQuery, setCustQuery] = useState('');
  const [prodQuery, setProdQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [preview, setPreview] = useState<VanSellPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; invoiceNumber: string; netAmount: number; paidAmount?: number; status?: string } | null>(null);
  // Collection-in-Sell: tenders entered in the Payment step (empty = credit).
  const [tenders, setTenders] = useState<PaymentTender[]>([]);
  // Final pre-issue confirmation modal (UX safeguard; no server change).
  const [confirmOpen, setConfirmOpen] = useState(false);
  // One key per sale attempt — makes a retry safe (no double sale) and is the
  // seam Phase 6 reuses to replay an offline sale exactly once.
  const [saleKey, setSaleKey] = useState<string>(() => uuid());

  const cName = (c: SellCustomer) => (ar && c.name_ar ? c.name_ar : c.name);
  const pName = (p: SellProduct) => (ar && p.name_ar ? p.name_ar : p.name);
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // Base units a chosen UoM represents (1 for base/unset) — for the stock hint.
  const lineFactor = (p: SellProduct, uom: string | null | undefined): number =>
    (uom ? p.units?.find((u) => u.uom === uom)?.factor : 1) || 1;

  const filteredCustomers = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers.filter((c) => cName(c).toLowerCase().includes(q) || c.code.toLowerCase().includes(q)).slice(0, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custQuery, customers, ar]);

  const filteredProducts = useMemo(() => {
    const q = prodQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products.filter((p) => pName(p).toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodQuery, products, ar]);

  const cartQty = (pid: string) => cart.find((l) => l.productId === pid)?.quantity ?? 0;
  function setQty(pid: string, qty: number) {
    setCart((ls) => {
      const exists = ls.find((l) => l.productId === pid);
      if (qty <= 0) return ls.filter((l) => l.productId !== pid);
      if (exists) return ls.map((l) => (l.productId === pid ? { ...l, quantity: qty } : l));
      return [...ls, { productId: pid, quantity: qty, discount_pct: 0 }];
    });
    setPreview(null);
  }
  function setDiscount(pid: string, pct: number) {
    setCart((ls) => ls.map((l) => (l.productId === pid ? { ...l, discount_pct: Math.max(0, pct) } : l)));
    setPreview(null);
  }
  function setUom(pid: string, uom: string) {
    setCart((ls) => ls.map((l) => (l.productId === pid ? { ...l, uom: uom || null } : l)));
    setPreview(null);
  }

  function chooseCustomer(id: string) { setCustomerId(id); setStep('products'); }

  async function goReview() {
    if (!customerId || cart.length === 0) return;
    if (canDiscount) {
      const over = firstDiscountOverCap(cart.map((l) => ({ product_id: l.productId, quantity: l.quantity, discount_pct: l.discount_pct, uom: l.uom ?? null })), discountCapPct);
      if (over) { toast.error(t('vanSales.sell.discountOverCap')); return; }
    }
    if (!online) { toast.error(t('vanSales.sell.offlinePricing')); return; }
    setBusy(true);
    try {
      const res = await previewVanSale({
        branch_id: branchId, customer_id: customerId,
        lines: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity, discount_pct: l.discount_pct, uom: l.uom ?? null })),
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.sell.error')); return; }
      setPreview(res.data);
      setStep('review');
    } finally { setBusy(false); }
  }

  async function issue() {
    if (!customerId || cart.length === 0) return;
    if (!online) { toast.error(t('vanSales.sell.offlinePricing')); return; }
    setBusy(true);
    try {
      const res = await vanSell({
        branch_id: branchId, customer_id: customerId, idempotency_key: saleKey,
        lines: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity, discount_pct: l.discount_pct, uom: l.uom ?? null })),
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.sell.error')); return; }
      setResult({ id: res.data.id, invoiceNumber: res.data.invoiceNumber, netAmount: res.data.netAmount });
      if (customerId) { setVisitOutcome(customerId, 'new_sale'); void recordVisitOutcome({ customerId, outcome: 'new_sale' }); }
      setStep('done');
      if (customerId) clearVisitWork(customerId, 'sell');
      toast.success(t('vanSales.sell.issued', { number: res.data.invoiceNumber }));
    } finally { setBusy(false); }
  }

  // ── Collection-in-Sell: Payment step ────────────────────────────────────────
  const net = preview?.totals.net_amount ?? 0;
  const paid = sumTenders(tenders);
  const remaining = outstandingAfter(net, paid);
  const payStatus = paymentStatusFor(net, paid);            // 'paid' | 'partially_paid' | 'credit'
  const newBalance = newBalanceAfter(Number(customer?.balance ?? 0), net, paid);
  const tenderError = validateTenders(net, tenders);
  // Credit-control guard (mirrors the RPC; salesman cannot override — Phase 1).
  const today = new Date().toISOString().slice(0, 10);
  const creditLimit = Number(customer?.credit_limit ?? 0);
  const currentBalance = Number(customer?.balance ?? 0);
  const termsDays = Number(customer?.payment_terms_days ?? 0);
  const ccEnabled = customer?.credit_control_enabled !== false;
  const overdue = isOverdueBlocked(termsDays, customer?.oldest_unpaid_date ?? null, today, ccEnabled);
  const overdueDayCount = overdueDays(customer?.oldest_unpaid_date ?? null, today);
  const availableCredit = availableCreditFor(creditLimit, currentBalance);
  const overdueAmount = Number(customer?.overdue_amount ?? 0);
  const openInvoiceCount = Number(customer?.open_invoice_count ?? 0);
  const creditStatus = creditStatusOf({ creditLimit, currentBalance, overdue });
  const isCreditBlocked = creditBlocked(creditLimit, currentBalance, net, paid, overdue);

  function payFullCash() { setTenders([{ method: 'cash', amount: net, reference: null }]); }
  function payCredit() { setTenders([]); }
  function addTender() { setTenders((ts) => [...ts, { method: 'cash', amount: Math.max(0, remaining), reference: null }]); }
  function removeTender(i: number) { setTenders((ts) => ts.filter((_, idx) => idx !== i)); }
  function updateTender(i: number, patch: Partial<PaymentTender>) {
    setTenders((ts) => ts.map((tn, idx) => (idx === i ? { ...tn, ...patch } : tn)));
  }

  async function issueWithPayment() {
    if (!customerId || cart.length === 0) return;
    if (!online) { toast.error(t('vanSales.sell.offlinePricing')); return; }
    const err = validateTenders(net, tenders);
    if (err) { toast.error(t(`vanSales.sell.payment.err_${err}`)); return; }
    if (isCreditBlocked) {
      toast.error(
        overdue ? t('vanSales.sell.payment.creditWarnBlocked')
          : creditLimit <= 0 ? t('vanSales.sell.payment.creditWarnZero')
            : t('vanSales.sell.payment.creditWarnExceed'),
      );
      return;
    }
    setBusy(true);
    try {
      const res = await vanSellWithPayment({
        branch_id: branchId, customer_id: customerId, idempotency_key: saleKey,
        lines: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity, discount_pct: l.discount_pct, uom: l.uom ?? null })),
        tenders,
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.sell.error')); return; }
      setResult({ id: res.data.id, invoiceNumber: res.data.invoiceNumber, netAmount: res.data.netAmount, paidAmount: res.data.paidAmount, status: res.data.status });
      if (customerId) { setVisitOutcome(customerId, 'new_sale'); void recordVisitOutcome({ customerId, outcome: 'new_sale' }); }
      setStep('done');
      if (customerId) clearVisitWork(customerId, 'sell');
      toast.success(t('vanSales.sell.issued', { number: res.data.invoiceNumber }));
    } finally { setBusy(false); }
  }

  function reset() {
    setResult(null); setPreview(null); setCart([]); setTenders([]); setConfirmOpen(false); setSaleKey(uuid());
    setCustomerId(preselect); setStep(preselect ? 'products' : 'customer');
  }

  // Per-line summary for the confirmation modal, shown in the ENTERED unit (UoM,
  // qty, per-UoM price) — reads the server-priced preview, converts the per-base
  // price back to the chosen UoM. Display only.
  const baseUomOf = (p: SellProduct | undefined) => p?.units?.find((u) => u.factor === 1)?.uom ?? p?.defaultSellUom ?? null;
  const confirmLines = preview
    ? cart.filter((l) => l.quantity > 0).map((l) => {
        const p = productById.get(l.productId);
        const pv = preview.lines.find((x) => x.product_id === l.productId);
        const factor = p ? lineFactor(p, l.uom) : 1;
        return {
          key: l.productId,
          name: p ? pName(p) : l.productId,
          uom: l.uom ?? baseUomOf(p),
          qty: l.quantity,
          unitPrice: (pv?.unit_price ?? 0) * factor, // per-UoM
          discount: l.discount_pct,
          lineTotal: pv?.line_total ?? 0,
        };
      })
    : [];

  // Open the modal from the sticky "Issue" actions; Confirm runs the real issue.
  function confirmIssue() {
    setConfirmOpen(false);
    if (collectInSell) issueWithPayment(); else issue();
  }

  // Blocked customer → jump straight to Collection for this customer (their
  // outstanding invoices auto-load there), turning a blocked sale into debt recovery.
  function goCollect() {
    if (!customerId) return;
    router.push(`/field/van-sales/collect?customer=${customerId}`);
  }

  async function share() {
    if (!result) return;
    const text = t('vanSales.sell.shareText', { number: result.invoiceNumber, net: result.netAmount.toFixed(2) });
    const url = typeof window !== 'undefined' ? `${window.location.origin}/print/receipt/${result.id}` : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: result.invoiceNumber, text, url }); } catch { /* user cancelled */ }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} ${url}`.trim());
      toast.success(t('vanSales.sell.share'));
    }
  }

  const money = (n: number) => n.toFixed(2);

  return (
    <div className="mx-auto max-w-2xl pb-36 lg:pb-28">
      {offlineEnabled && !online && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span><strong>{t('vanSales.sell.offlineTitle')}.</strong> {t('vanSales.sell.offlinePricing')}</span>
        </div>
      )}

      {/* Stepper header */}
      <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <StepChip active={step === 'customer'} done={!!customerId && step !== 'customer'} label={t('vanSales.sell.stepCustomer')} />
        <span>›</span>
        <StepChip active={step === 'products'} done={step === 'review' || step === 'payment' || step === 'done'} label={t('vanSales.sell.stepProducts')} />
        <span>›</span>
        <StepChip active={step === 'review'} done={step === 'payment' || step === 'done'} label={t('vanSales.sell.stepReview')} />
        {collectInSell && (
          <>
            <span>›</span>
            <StepChip active={step === 'payment'} done={step === 'done'} label={t('vanSales.sell.payment.step')} />
          </>
        )}
      </div>

      {/* Selected customer banner */}
      {customer && step !== 'customer' && step !== 'done' && (
        <Card className="mb-3">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold">
                  <User className="h-4 w-4 shrink-0" /><span className="truncate">{cName(customer)}</span>
                  {collectInSell && <CreditBadge status={creditStatus} t={t} />}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                  {t('vanSales.sell.balance')} {money(Number(customer.balance))}
                  {Number(customer.credit_limit) > 0 && <> · {t('vanSales.sell.creditLimit')} {money(Number(customer.credit_limit))}</>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {customerId && (
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/field/van-sales/statement/${customerId}`)}>
                    {t('vanSales.sell.statement')}
                  </Button>
                )}
                {!preselect && <Button variant="ghost" size="sm" onClick={() => setStep('customer')}>{t('vanSales.sell.stepCustomer')}</Button>}
              </div>
            </div>
            {/* Credit standing + reason, visible BEFORE building the sale. */}
            {collectInSell && (
              <CreditStandingCard
                status={creditStatus} creditLimit={creditLimit} currentBalance={currentBalance}
                availableCredit={availableCredit} overdueDayCount={overdueDayCount} termsDays={termsDays}
                overdueAmount={overdueAmount} openInvoiceCount={openInvoiceCount}
                money={money} t={t} onCollectNow={goCollect}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP: customer */}
      {step === 'customer' && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="ps-9" placeholder={t('vanSales.sell.searchCustomer')} value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
            </div>
            {filteredCustomers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('vanSales.sell.noCustomers')}</p>
            ) : (
              <ul className="divide-y">
                {filteredCustomers.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 py-3 text-start hover:bg-secondary/40" onClick={() => chooseCustomer(c.id)}>
                      <span className="min-w-0"><span className="block truncate font-medium">{cName(c)}</span><span className="block text-xs text-muted-foreground">{c.code}</span></span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP: products */}
      {step === 'products' && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="ps-9" placeholder={t('vanSales.sell.searchProduct')} value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} />
            </div>
            {canDiscount && discountCapPct != null && (
              <p className="text-xs text-muted-foreground">{t('vanSales.sell.discountCap', { cap: discountCapPct })}</p>
            )}
            {products.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('vanSales.sell.noVanStock')}</p>
            ) : filteredProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('vanSales.sell.noProductMatch')}</p>
            ) : null}
            <ul className="space-y-2">
              {filteredProducts.map((p) => {
                const qty = cartQty(p.id);
                const inCart = qty > 0;
                const line = cart.find((l) => l.productId === p.id);
                return (
                  <li key={p.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{pName(p)}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{p.code}</span>
                          <Badge variant={p.available > 0 ? 'secondary' : 'outline'} dir="ltr">
                            {p.available > 0 ? `${t('vanSales.sell.inStock')}: ${p.available}` : t('vanSales.sell.outOfStock')}
                          </Badge>
                        </div>
                      </div>
                      {!inCart ? (
                        <Button size="sm" variant="outline" onClick={() => setQty(p.id, 1)}><Plus className="h-4 w-4" /></Button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setQty(p.id, qty - 1)} aria-label="−"><Minus className="h-4 w-4" /></Button>
                          <Input type="number" inputMode="numeric" min={0} className="h-9 w-16 text-center" value={qty} onChange={(e) => setQty(p.id, Number(e.target.value))} />
                          <Button size="icon" variant="ghost" onClick={() => setQty(p.id, qty + 1)} aria-label="+"><Plus className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </div>
                    {inCart && multiUom && (p.units?.length ?? 0) > 1 && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('vanSales.sell.unit')}</span>
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          value={line?.uom ?? ''}
                          onChange={(e) => setUom(p.id, e.target.value)}
                        >
                          {(p.units ?? []).map((u) => (
                            <option key={u.uom} value={u.factor === 1 ? '' : u.uom}>
                              {u.factor === 1 ? u.uom : `${u.uom} (×${u.factor})`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {inCart && qty * (lineFactor(p, line?.uom) ) > p.available && (
                      <p className="mt-1 text-xs text-warning">{t('vanSales.sell.outOfStock')}</p>
                    )}
                    {inCart && canDiscount && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('vanSales.sell.discount')}</span>
                        <Input type="number" inputMode="decimal" min={0} max={discountCapPct ?? undefined} className="h-8 w-20"
                          value={line?.discount_pct ?? 0} onChange={(e) => setDiscount(p.id, Number(e.target.value))} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* STEP: review */}
      {step === 'review' && preview && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <ul className="divide-y">
              {preview.lines.map((l) => {
                const p = productById.get(l.product_id);
                return (
                  <li key={l.product_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{p ? pName(p) : l.product_id}</span>
                      <span className="block text-xs text-muted-foreground" dir="ltr">{l.quantity} × {money(l.unit_price)}{l.discount_pct > 0 ? ` −${l.discount_pct}%` : ''}</span></span>
                    <span className="shrink-0 font-medium tabular-nums" dir="ltr">{money(l.line_total)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-1 border-t pt-3 text-sm">
              <Row label={t('vanSales.sell.subtotal')} value={money(preview.totals.total_amount)} />
              {preview.totals.discount_amount > 0 && <Row label={t('vanSales.sell.discountTotal')} value={`−${money(preview.totals.discount_amount)}`} />}
              {preview.totals.tax_amount > 0 && <Row label={t('vanSales.sell.tax')} value={money(preview.totals.tax_amount)} />}
              <div className="flex items-center justify-between border-t pt-2 text-base font-bold"><span>{t('vanSales.sell.netTotal')}</span><span className="tabular-nums" dir="ltr">{money(preview.totals.net_amount)}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP: payment — Collection-in-Sell */}
      {step === 'payment' && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between text-base font-bold">
              <span>{t('vanSales.sell.payment.net')}</span>
              <span className="tabular-nums" dir="ltr">{money(net)}</span>
            </div>

            {canCollect ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={payFullCash}>
                    <Wallet className="h-4 w-4" /> {t('vanSales.sell.payment.payFullCash')}
                  </Button>
                  <Button type="button" variant="outline" onClick={payCredit}>
                    {t('vanSales.sell.payment.credit')}
                  </Button>
                </div>

                <ul className="space-y-2">
                  {tenders.map((tn, i) => (
                    <li key={i} className="space-y-2 rounded-md border p-2">
                      <div className="flex items-center gap-2">
                        <select
                          className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                          value={tn.method}
                          onChange={(e) => updateTender(i, { method: e.target.value as PaymentMethod })}
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>{t(`vanSales.sell.payment.m_${m}`)}</option>
                          ))}
                        </select>
                        <Input
                          type="number" inputMode="decimal" min={0} dir="ltr"
                          className="h-9 w-28 text-center"
                          value={tn.amount}
                          onChange={(e) => updateTender(i, { amount: Number(e.target.value) })}
                        />
                        <button
                          type="button" onClick={() => removeTender(i)}
                          aria-label={t('vanSales.sell.payment.removeTender')}
                          className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {REFERENCE_REQUIRED_METHODS.includes(tn.method) && (
                        <Input
                          className="h-9" placeholder={t('vanSales.sell.payment.reference')}
                          value={tn.reference ?? ''}
                          onChange={(e) => updateTender(i, { reference: e.target.value })}
                        />
                      )}
                    </li>
                  ))}
                </ul>

                <Button type="button" variant="ghost" size="sm" onClick={addTender}>
                  <Plus className="h-4 w-4" /> {t('vanSales.sell.payment.addTender')}
                </Button>
              </>
            ) : (
              <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
                {t('vanSales.sell.payment.credit')}
              </p>
            )}

            <div className="space-y-1 border-t pt-3 text-sm">
              <Row label={t('vanSales.sell.payment.paid')} value={money(paid)} />
              <Row label={t('vanSales.sell.payment.remaining')} value={money(remaining)} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('vanSales.sell.payment.statusLabel')}</span>
                <Badge variant={payStatus === 'paid' ? 'success' : payStatus === 'partially_paid' ? 'default' : 'secondary'}>
                  {t(`vanSales.sell.payment.st_${payStatus}`)}
                </Badge>
              </div>
              <Row label={t('vanSales.sell.payment.newBalance')} value={money(newBalance)} />
            </div>

            {/* Credit standing + reason (same card as the banner) + this sale's
                remaining and a per-sale block warning. */}
            <CreditStandingCard
              status={creditStatus} creditLimit={creditLimit} currentBalance={currentBalance}
              availableCredit={availableCredit} overdueDayCount={overdueDayCount} termsDays={termsDays}
              overdueAmount={overdueAmount} openInvoiceCount={openInvoiceCount}
                money={money} t={t} onCollectNow={goCollect}
            />
            <div className="rounded-md border bg-secondary/30 p-3 text-sm">
              <Row label={t('vanSales.sell.payment.remainingInvoice')} value={money(remaining)} />
            </div>
            {isCreditBlocked && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive">
                {overdue ? t('vanSales.sell.payment.creditWarnBlocked')
                  : creditLimit <= 0 ? t('vanSales.sell.payment.creditWarnZero')
                    : t('vanSales.sell.payment.creditWarnExceed')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP: done — receipt */}
      {step === 'done' && result && (
        <Card>
          <CardContent className="space-y-4 pt-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15"><Check className="h-6 w-6 text-success" /></div>
            <div>
              <div className="text-sm text-muted-foreground">{t('vanSales.sell.completed')}</div>
              <div className="text-lg font-bold">{t('vanSales.sell.issued', { number: result.invoiceNumber })}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{money(result.netAmount)}</div>
              {result.status && (
                <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                  <Badge variant={result.status === 'paid' ? 'success' : result.status === 'partially_paid' ? 'default' : 'secondary'}>
                    {t(`vanSales.sell.payment.st_${result.status === 'paid' ? 'paid' : result.status === 'partially_paid' ? 'partially_paid' : 'credit'}`)}
                  </Badge>
                  {(result.paidAmount ?? 0) > 0 && (
                    <span className="text-muted-foreground" dir="ltr">
                      {t('vanSales.sell.payment.paid')} {money(result.paidAmount ?? 0)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={`/print/receipt/${result.id}`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full"><Printer className="h-4 w-4" /> {t('vanSales.sell.printReceipt')}</Button>
              </a>
              <a href={`/print/invoices/${result.id}`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full"><FileText className="h-4 w-4" /> {t('vanSales.sell.printInvoice')}</Button>
              </a>
            </div>
            <Button variant="outline" className="w-full" onClick={share}><Share2 className="h-4 w-4" /> {t('vanSales.sell.share')}</Button>
            {smartNext ? (
              <>
                {/* Keep the rep moving through the route: Next Customer is primary. */}
                <PendingLink href="/field/next" pendingLabel={t('common.opening')} className={`w-full ${buttonVariants({ size: 'lg' })}`}>
                  <ArrowRight className="h-5 w-5 rtl:rotate-180" /> {t('vanSales.sell.nextCustomer')}
                </PendingLink>
                {/* Another action for the SAME customer → back to the visit cockpit
                    (Collection / Return / Visit Outcome / History / another Sale). */}
                {customerId && (
                  <PendingLink href={`/field/van-sales/statement/${customerId}`} pendingLabel={t('common.opening')} className={`w-full ${buttonVariants({ variant: 'outline' })}`}>
                    <User className="h-4 w-4" /> {t('vanSales.sell.anotherAction')}
                  </PendingLink>
                )}
              </>
            ) : (
              <Button className="w-full" onClick={reset}><ReceiptText className="h-4 w-4" /> {t('vanSales.sell.newSale')}</Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sticky action bar. Sits ABOVE the mobile bottom-nav (h-14 + safe-area,
          z-40) so the Review/Issue action is never hidden behind the tab bar;
          flush bottom on desktop where the bottom-nav is hidden (lg). */}
      {step !== 'done' && (
        <div className="fixed inset-x-0 bottom-nav-safe z-40 border-t bg-background/95 p-3 backdrop-blur lg:bottom-0">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            {step === 'review' ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => setStep('products')}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('vanSales.sell.back')}</Button>
                {collectInSell ? (
                  <Button className="flex-[2]" size="lg" onClick={() => setStep('payment')}>
                    <Wallet className="h-4 w-4" /> {t('vanSales.sell.payment.proceed')}
                  </Button>
                ) : (
                  <Button className="flex-[2]" size="lg" disabled={busy || !online} onClick={() => setConfirmOpen(true)}>
                    {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('vanSales.sell.issuing')}</> : <><ReceiptText className="h-4 w-4" /> {t('vanSales.sell.issue')}</>}
                  </Button>
                )}
              </>
            ) : step === 'payment' ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => setStep('review')}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('vanSales.sell.back')}</Button>
                <Button className="flex-[2]" size="lg" disabled={busy || !online || !!tenderError || isCreditBlocked} onClick={() => setConfirmOpen(true)}>
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('vanSales.sell.issuing')}</> : <><ReceiptText className="h-4 w-4" /> {t('vanSales.sell.issue')}</>}
                </Button>
              </>
            ) : step === 'products' ? (
              <Button className="w-full" size="lg" disabled={cart.length === 0 || busy} onClick={goReview}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('vanSales.sell.pricing')}</>
                  : <><ShoppingCart className="h-4 w-4" /> {cart.length > 0 ? `${t('vanSales.sell.review')} (${cart.length})` : t('vanSales.sell.emptyCart')}</>}
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => router.push('/field/van-sales')}>{t('vanSales.sell.back')}</Button>
            )}
          </div>
        </div>
      )}

      {/* Final pre-issue confirmation (UX safeguard). Double-check customer, items,
          UoM, totals and payment before the invoice is issued + printed. */}
      {confirmOpen && preview && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold">{t('vanSales.sell.confirm.title')}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('vanSales.sell.confirm.subtitle')}</p>

            <div className="mt-3 border-y py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('vanSales.sell.confirm.customer')}</span>
                <span className="font-semibold">{customer ? cName(customer) : '—'}</span>
              </div>
            </div>

            {/* Mobile (< sm): one row per line — name + (qty × price − disc) = total. */}
            <div className="mt-2 space-y-1.5 sm:hidden">
              {confirmLines.map((l) => (
                <div key={l.key} className="flex items-start justify-between gap-2 border-b pb-1.5 text-xs last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="tabular-nums text-muted-foreground" dir="ltr">
                      {l.qty}{l.uom ? ` ${l.uom}` : ''} × {money(l.unitPrice)}{l.discount > 0 ? ` −${l.discount}%` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums" dir="ltr">{money(l.lineTotal)}</span>
                </div>
              ))}
            </div>
            {/* Desktop (sm+): table. */}
            <table className="mt-2 hidden w-full text-xs sm:table">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-1 text-start font-medium">{t('vanSales.sell.confirm.colSku')}</th>
                  <th className="p-1 text-center font-medium">{t('vanSales.sell.confirm.colUom')}</th>
                  <th className="p-1 text-center font-medium">{t('vanSales.sell.confirm.colQty')}</th>
                  <th className="p-1 text-end font-medium">{t('vanSales.sell.confirm.colPrice')}</th>
                  <th className="p-1 text-center font-medium">{t('vanSales.sell.confirm.colDisc')}</th>
                  <th className="p-1 text-end font-medium">{t('vanSales.sell.confirm.colTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {confirmLines.map((l) => (
                  <tr key={l.key} className="border-b last:border-0">
                    <td className="p-1">{l.name}</td>
                    <td className="p-1 text-center">{l.uom ?? '—'}</td>
                    <td className="p-1 text-center tabular-nums" dir="ltr">{l.qty}</td>
                    <td className="p-1 text-end tabular-nums" dir="ltr">{money(l.unitPrice)}</td>
                    <td className="p-1 text-center tabular-nums" dir="ltr">{l.discount > 0 ? `${l.discount}%` : '—'}</td>
                    <td className="p-1 text-end tabular-nums" dir="ltr">{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 space-y-1 border-t pt-2 text-sm">
              <div className="flex items-center justify-between font-bold">
                <span>{t('vanSales.sell.payment.net')}</span>
                <span className="tabular-nums" dir="ltr">{money(net)}</span>
              </div>
              {collectInSell ? (
                <>
                  <Row label={t('vanSales.sell.payment.paid')} value={money(paid)} />
                  <Row label={t('vanSales.sell.payment.remaining')} value={money(remaining)} />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('vanSales.sell.payment.statusLabel')}</span>
                    <Badge variant={payStatus === 'paid' ? 'success' : payStatus === 'partially_paid' ? 'default' : 'secondary'}>
                      {t(`vanSales.sell.payment.st_${payStatus}`)}
                    </Badge>
                  </div>
                  {tenders.length > 0 && (
                    <Row
                      label={t('vanSales.sell.confirm.paymentMethods')}
                      value={tenders.map((tn) => `${t(`vanSales.sell.payment.m_${tn.method}`)} ${money(Number(tn.amount) || 0)}`).join(' · ')}
                    />
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('vanSales.sell.payment.statusLabel')}</span>
                  <Badge variant="secondary">{t('vanSales.sell.payment.st_credit')}</Badge>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('vanSales.sell.confirm.back')}
              </Button>
              <Button className="flex-[2]" size="lg" disabled={busy} onClick={confirmIssue}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('vanSales.sell.issuing')}</> : <><Check className="h-4 w-4" /> {t('vanSales.sell.confirm.issue')}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepChip({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-success/15 text-success' : 'bg-secondary'}`}>
      {done && <Check className="h-3 w-3" />} {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-muted-foreground"><span>{label}</span><span className="tabular-nums" dir="ltr">{value}</span></div>;
}

function CreditBadge({ status, t }: { status: CreditStatus; t: (k: string) => string }) {
  const variant =
    status === 'good' ? 'success'
      : status === 'near_limit' ? 'warning'
        : status === 'cash_only' ? 'secondary'
          : 'destructive';
  return <Badge variant={variant}>{t(`vanSales.sell.payment.cs_${status}`)}</Badge>;
}

const STATUS_DOT: Record<CreditStatus, string> = {
  good: '🟢', near_limit: '🟡', over_limit: '🔴', overdue: '🔴', cash_only: '💵',
};

/** Credit standing + reason + the figures behind it — shown on the customer
 *  banner (before the sale) and the Payment step, so the reason a customer is
 *  blocked is always explicit. */
function CreditStandingCard({
  status, creditLimit, currentBalance, availableCredit, overdueDayCount, termsDays,
  overdueAmount, openInvoiceCount, money, t, onCollectNow,
}: {
  status: CreditStatus;
  creditLimit: number; currentBalance: number; availableCredit: number;
  overdueDayCount: number | null; termsDays: number;
  overdueAmount: number; openInvoiceCount: number;
  money: (n: number) => string; t: (k: string, v?: Record<string, string | number>) => string;
  /** When the standing is blocked, offer a one-tap jump to Collection for this customer. */
  onCollectNow?: () => void;
}) {
  const blocked = creditStandingBlocked(status);
  const exceededBy = Math.max(0, Math.round((currentBalance - creditLimit) * 100) / 100);
  const tone =
    status === 'good' ? 'border-success/40 bg-success/5'
      : status === 'near_limit' ? 'border-warning/40 bg-warning/5'
        : status === 'cash_only' ? 'border-border bg-secondary/40'
          : 'border-destructive/40 bg-destructive/5';
  return (
    <div className={`space-y-1 rounded-md border p-3 text-sm ${tone}`}>
      <div className="flex items-center gap-2 font-semibold">
        <span aria-hidden>{STATUS_DOT[status]}</span>
        {t(`vanSales.sell.payment.cs_${status}`)}
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-medium">{t('vanSales.sell.payment.reasonLabel')}:</span>{' '}
        {t(`vanSales.sell.payment.reason_${status}`)}
      </div>
      <div className="space-y-0.5 pt-0.5">
        {status === 'near_limit' && (
          <Row label={t('vanSales.sell.payment.availableCredit')} value={money(availableCredit)} />
        )}
        {status === 'over_limit' && (
          <>
            <Row label={t('vanSales.sell.payment.creditLimit')} value={money(creditLimit)} />
            <Row label={t('vanSales.sell.payment.currentOutstanding')} value={money(currentBalance)} />
            <Row label={t('vanSales.sell.payment.exceededBy')} value={money(exceededBy)} />
          </>
        )}
        {status === 'overdue' && (
          <>
            <Row label={t('vanSales.sell.payment.oldestUnpaid')}
              value={overdueDayCount != null ? t('vanSales.sell.payment.daysOverdue', { days: overdueDayCount }) : '—'} />
            {termsDays > 0 && <Row label={t('vanSales.sell.payment.allowedDays')} value={String(termsDays)} />}
          </>
        )}
      </div>
      {blocked && (
        <div className="mt-1 space-y-2">
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs font-medium text-destructive">
            {t('vanSales.sell.payment.creditBlockedMsg')}
          </p>
          {/* Debt snapshot so the rep grasps the situation before opening Collection. */}
          {openInvoiceCount > 0 && (
            <div className="space-y-0.5 rounded-md border bg-background/60 p-2 text-xs">
              <Row label={t('vanSales.sell.payment.debtOutstanding')} value={money(currentBalance)} />
              {overdueAmount > 0 && <Row label={t('vanSales.sell.payment.debtOverdue')} value={money(overdueAmount)} />}
              <Row label={t('vanSales.sell.payment.debtOpenInvoices')} value={String(openInvoiceCount)} />
              {overdueDayCount != null && (
                <Row label={t('vanSales.sell.payment.debtOldestInvoice')} value={t('vanSales.sell.payment.daysCount', { days: overdueDayCount })} />
              )}
            </div>
          )}
          {onCollectNow && (
            <Button type="button" size="sm" className="w-full" onClick={onCollectNow}>
              <HandCoins className="h-4 w-4" /> {t('vanSales.sell.payment.collectNow')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
