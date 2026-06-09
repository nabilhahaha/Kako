'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ShoppingCart, Plus, Minus, ArrowLeft, ArrowRight, Search, Check,
  Printer, Share2, ReceiptText, CloudOff, Loader2, User,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { useOnlineStatus } from '@/lib/offline-sync/use-network';
import { firstDiscountOverCap } from '@/lib/van-sales/sell';
import { previewVanSale, vanSell, type VanSellPreview } from '@/lib/van-sales/sell-server';

export interface SellCustomer { id: string; name: string; name_ar: string | null; code: string; balance: number; credit_limit: number }
export interface SellProduct { id: string; name: string; name_ar: string | null; code: string; available: number }

interface CartLine { productId: string; quantity: number; discount_pct: number }
type Step = 'customer' | 'products' | 'review' | 'done';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function SellScreen({
  branchId, customers, products, preselectCustomerId, discountCapPct, canDiscount, offlineEnabled,
}: {
  branchId: string;
  customers: SellCustomer[];
  products: SellProduct[];
  preselectCustomerId: string | null;
  discountCapPct: number | null;
  canDiscount: boolean;
  offlineEnabled: boolean;
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
  const [result, setResult] = useState<{ id: string; invoiceNumber: string; netAmount: number } | null>(null);
  // One key per sale attempt — makes a retry safe (no double sale) and is the
  // seam Phase 6 reuses to replay an offline sale exactly once.
  const [saleKey, setSaleKey] = useState<string>(() => uuid());

  const cName = (c: SellCustomer) => (ar && c.name_ar ? c.name_ar : c.name);
  const pName = (p: SellProduct) => (ar && p.name_ar ? p.name_ar : p.name);
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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

  function chooseCustomer(id: string) { setCustomerId(id); setStep('products'); }

  async function goReview() {
    if (!customerId || cart.length === 0) return;
    if (canDiscount) {
      const over = firstDiscountOverCap(cart.map((l) => ({ product_id: l.productId, quantity: l.quantity, discount_pct: l.discount_pct })), discountCapPct);
      if (over) { toast.error(t('vanSales.sell.discountOverCap')); return; }
    }
    if (!online) { toast.error(t('vanSales.sell.offlinePricing')); return; }
    setBusy(true);
    try {
      const res = await previewVanSale({
        branch_id: branchId, customer_id: customerId,
        lines: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity, discount_pct: l.discount_pct })),
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
        lines: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity, discount_pct: l.discount_pct })),
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.sell.error')); return; }
      setResult({ id: res.data.id, invoiceNumber: res.data.invoiceNumber, netAmount: res.data.netAmount });
      setStep('done');
      toast.success(t('vanSales.sell.issued', { number: res.data.invoiceNumber }));
    } finally { setBusy(false); }
  }

  function reset() {
    setResult(null); setPreview(null); setCart([]); setSaleKey(uuid());
    setCustomerId(preselect); setStep(preselect ? 'products' : 'customer');
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
    <div className="mx-auto max-w-2xl pb-28">
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
        <StepChip active={step === 'products'} done={step === 'review' || step === 'done'} label={t('vanSales.sell.stepProducts')} />
        <span>›</span>
        <StepChip active={step === 'review'} done={step === 'done'} label={t('vanSales.sell.stepReview')} />
      </div>

      {/* Selected customer banner */}
      {customer && step !== 'customer' && step !== 'done' && (
        <Card className="mb-3">
          <CardContent className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold"><User className="h-4 w-4 shrink-0" /><span className="truncate">{cName(customer)}</span></div>
              <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                {t('vanSales.sell.balance')} {money(Number(customer.balance))}
                {Number(customer.credit_limit) > 0 && <> · {t('vanSales.sell.creditLimit')} {money(Number(customer.credit_limit))}</>}
              </div>
            </div>
            {!preselect && <Button variant="ghost" size="sm" onClick={() => setStep('customer')}>{t('vanSales.sell.stepCustomer')}</Button>}
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
                    {inCart && qty > p.available && (
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

      {/* STEP: done — receipt */}
      {step === 'done' && result && (
        <Card>
          <CardContent className="space-y-4 pt-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15"><Check className="h-6 w-6 text-success" /></div>
            <div>
              <div className="text-lg font-bold">{t('vanSales.sell.issued', { number: result.invoiceNumber })}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{money(result.netAmount)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={`/print/receipt/${result.id}`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full"><Printer className="h-4 w-4" /> {t('vanSales.sell.print')}</Button>
              </a>
              <Button variant="outline" onClick={share}><Share2 className="h-4 w-4" /> {t('vanSales.sell.share')}</Button>
            </div>
            <Button className="w-full" onClick={reset}><ReceiptText className="h-4 w-4" /> {t('vanSales.sell.newSale')}</Button>
          </CardContent>
        </Card>
      )}

      {/* Sticky action bar */}
      {step !== 'done' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            {step === 'review' ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => setStep('products')}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('vanSales.sell.back')}</Button>
                <Button className="flex-[2]" size="lg" disabled={busy || !online} onClick={issue}>
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
