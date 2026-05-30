'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { quickSale, logNoSaleVisit } from '../sales/pos/actions';
import { getCustomerDebt, collectPayment, createPendingCustomer, startDay, endDay, type CustomerDebt } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import { VISIT_DAYS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Branch, ErpCustomer, PaymentMethod, ProductCatalog } from '@/lib/erp/types';
import { Search, Plus, Minus, Trash2, Wifi, WifiOff, RefreshCw, ShoppingBag, CheckCircle2, Loader2, Printer, MapPin, Warehouse, Wallet, UserPlus, FileText, PackagePlus, X } from 'lucide-react';
import { toast } from 'sonner';

export interface PlanCustomer {
  id: string;
  name: string;
}

const DATA_KEY = 'kako_rep_data';
const QUEUE_KEY = 'kako_rep_queue';

interface SalePayload {
  branch_id: string;
  customer_id: string;
  lines: LineInput[];
  pay: boolean;
  amount: number;
  payment_method: PaymentMethod;
}
interface PendingSale {
  id: string;
  createdAt: string;
  customerName: string;
  total: number;
  payload: SalePayload;
}
interface CartLine {
  product: ProductCatalog;
  quantity: number;
}

function loadQueue(): PendingSale[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveQueue(q: PendingSale[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function RepTerminal({
  customers: customersProp,
  branches: branchesProp,
  products: productsProp,
  sourceLabel,
  todayPlan,
  visitedToday,
  dayStatus,
  vanId,
  repId,
}: {
  customers: ErpCustomer[];
  branches: Branch[];
  products: ProductCatalog[];
  sourceLabel: string;
  todayPlan: PlanCustomer[];
  visitedToday: string[];
  dayStatus: 'none' | 'open' | 'closed';
  vanId: string | null;
  repId: string;
}) {
  const { t } = useI18n();

  // Master data: prefer fresh server props; cache them; fall back to cache offline.
  const [customers, setCustomers] = useState(customersProp);
  const [branches, setBranches] = useState(branchesProp);
  const [products, setProducts] = useState(productsProp);

  const [online, setOnline] = useState(true);
  const [branchId, setBranchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pay, setPay] = useState(true);
  const [queue, setQueue] = useState<PendingSale[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSale, setLastSale] = useState<{ invoice_id: string; invoice_number: string } | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set(visitedToday));
  const [debt, setDebt] = useState<CustomerDebt | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [collectFor, setCollectFor] = useState<{ id: string; number: string; remaining: number } | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [day, setDay] = useState(dayStatus);
  const [dayPending, setDayPending] = useState(false);
  const dayOpen = day === 'open';

  function onStartDay() {
    setDayPending(true);
    startDay(branchId).then((res) => {
      setDayPending(false);
      if (!res.ok) toast.error(res.error ?? t('rep.errorGeneric'));
      else { setDay('open'); toast.success(t('rep.toastDayStarted')); }
    });
  }
  function onEndDay() {
    setDayPending(true);
    endDay().then((res) => {
      setDayPending(false);
      if (!res.ok) toast.error(res.error ?? t('rep.errorGeneric'));
      else { setDay('closed'); toast.success(t('rep.toastDayEnded')); }
    });
  }

  // Hydrate from cache / seed cache, and read queue + online status.
  useEffect(() => {
    if (customersProp.length || productsProp.length) {
      localStorage.setItem(
        DATA_KEY,
        JSON.stringify({ customers: customersProp, branches: branchesProp, products: productsProp }),
      );
    } else {
      try {
        const cached = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
        if (cached) {
          setCustomers(cached.customers ?? []);
          setBranches(cached.branches ?? []);
          setProducts(cached.products ?? []);
        }
      } catch {
        /* ignore */
      }
    }
    setQueue(loadQueue());
    setOnline(navigator.onLine);
  }, [customersProp, branchesProp, productsProp]);

  useEffect(() => {
    setBranchId((b) => b || branches[0]?.id || '');
    setCustomerId((c) => c || customers.find((x) => x.is_approved !== false)?.id || '');
  }, [branches, customers]);

  const syncQueue = useCallback(async () => {
    const pending = loadQueue();
    if (pending.length === 0 || !navigator.onLine) return;
    setSyncing(true);
    let remaining = [...pending];
    for (const item of pending) {
      try {
        const res = await quickSale(item.payload);
        if (res.ok) {
          remaining = remaining.filter((x) => x.id !== item.id);
          saveQueue(remaining);
        } else {
          break; // stop on first hard failure
        }
      } catch {
        break; // network dropped again
      }
    }
    setQueue(remaining);
    setSyncing(false);
    const done = pending.length - remaining.length;
    if (done > 0) toast.success(t('rep.toastSynced', { count: done }));
  }, [t]);

  // Online/offline listeners + auto-sync.
  useEffect(() => {
    function goOnline() {
      setOnline(true);
      syncQueue();
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine) syncQueue();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [syncQueue]);

  const loadDebt = useCallback((custId: string) => {
    if (!custId || !navigator.onLine) {
      setDebt(null);
      return;
    }
    setDebtLoading(true);
    getCustomerDebt(custId)
      .then((res) => setDebt(res.ok ? res.data ?? null : null))
      .finally(() => setDebtLoading(false));
  }, []);

  useEffect(() => {
    loadDebt(customerId);
  }, [customerId, loadDebt]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.code.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.name_ar || '').toLowerCase().includes(q) ||
            (p.barcode || '').toLowerCase().includes(q),
        )
      : products;
    return list.slice(0, 60);
  }, [products, query]);

  function addToCart(p: ProductCatalog) {
    setCart((prev) => {
      const ex = prev.find((l) => l.product.id === p.id);
      if (ex) return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product: p, quantity: 1 }];
    });
  }
  function setQty(id: string, qty: number) {
    if (qty <= 0) return setCart((prev) => prev.filter((l) => l.product.id !== id));
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, quantity: qty } : l)));
  }

  const lineInputs: LineInput[] = cart.map((l) => ({
    product_id: l.product.id,
    quantity: l.quantity,
    unit_price: Number(l.product.sell_price),
    discount_pct: 0,
    tax_rate: Number(l.product.tax_rate),
  }));
  const totals = computeTotals(lineInputs);

  async function submit() {
    if (!branchId || !customerId || cart.length === 0) return;
    const payload: SalePayload = {
      branch_id: branchId,
      customer_id: customerId,
      lines: lineInputs,
      pay,
      amount: pay ? totals.net_amount : 0,
      payment_method: 'cash',
    };
    const customerName =
      customers.find((c) => c.id === customerId)?.name_ar ||
      customers.find((c) => c.id === customerId)?.name ||
      '';

    // Offline → enqueue immediately.
    if (!navigator.onLine) {
      enqueue(payload, customerName, totals.net_amount);
      return;
    }
    setSubmitting(true);
    try {
      const res = await quickSale(payload);
      if (!res.ok) {
        toast.error(res.error ?? t('rep.errorGeneric'));
        setSubmitting(false);
        return;
      }
      toast.success(t('rep.toastInvoiceDone', { number: res.data?.invoice_number ?? '' }));
      if (res.data) {
        setLastSale(res.data);
        setVisited((prev) => new Set(prev).add(customerId));
      }
      setCart([]);
      setQuery('');
    } catch {
      // Treat as connectivity loss mid-request → queue it.
      enqueue(payload, customerName, totals.net_amount);
    } finally {
      setSubmitting(false);
    }
  }

  function enqueue(payload: SalePayload, customerName: string, total: number) {
    const item: PendingSale = {
      id: Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
      customerName,
      total,
      payload,
    };
    const next = [...loadQueue(), item];
    saveQueue(next);
    setQueue(next);
    setCart([]);
    setQuery('');
    toast.success(t('rep.toastQueued'));
  }

  function onNoSale(custId: string) {
    startTransitionNoSale(custId);
  }
  function startTransitionNoSale(custId: string) {
    logNoSaleVisit({ branch_id: branchId, customer_id: custId }).then((res) => {
      if (!res.ok) toast.error(res.error ?? t('rep.errorGeneric'));
      else {
        toast.success(t('rep.toastNoSale'));
        setVisited((prev) => new Set(prev).add(custId));
      }
    });
  }

  const canSell = branchId && customerId && cart.length > 0 && dayOpen;

  if (products.length === 0 && customers.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {t('rep.noDataState')}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-3 pb-40">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t('rep.appTitle')}</h1>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <Button variant="outline" size="sm" onClick={syncQueue} disabled={syncing || !online} className="text-xs">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t('rep.pendingSync', { count: queue.length })}
            </Button>
          )}
          <Badge variant={online ? 'success' : 'destructive'} className="gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? t('rep.statusOnline') : t('rep.statusOffline')}
          </Badge>
        </div>
      </div>

      {!online && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          {t('rep.offlineBanner')}
        </div>
      )}

      {/* Day session control */}
      <div className="rounded-md border p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {day === 'open' ? t('rep.dayOpen') : day === 'closed' ? t('rep.dayClosed') : t('rep.dayNone')}
          </span>
          <div className="flex gap-2">
            {day === 'none' && (
              <Button size="sm" disabled={dayPending} onClick={onStartDay}>
                {dayPending && <Loader2 className="h-4 w-4 animate-spin" />} {t('rep.btnStartDay')}
              </Button>
            )}
            {day === 'open' && (
              <>
                <Link href={`/print/day-summary?rep=${repId}`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-secondary">
                  <Printer className="h-4 w-4" /> {t('rep.btnDaySummary')}
                </Link>
                <Button size="sm" variant="destructive" disabled={dayPending} onClick={onEndDay}>
                  {dayPending && <Loader2 className="h-4 w-4 animate-spin" />} {t('rep.btnEndDay')}
                </Button>
              </>
            )}
            {day === 'closed' && (
              <Link href={`/print/day-summary?rep=${repId}`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-secondary">
                <Printer className="h-4 w-4" /> {t('rep.btnDaySummary')}
              </Link>
            )}
          </div>
        </div>
        {day === 'closed' && (
          <p className="mt-1 text-xs text-muted-foreground">{t('rep.dayClosedHint')}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-secondary/30 p-2 text-xs">
        <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
        {t('rep.sellingFrom')} <span className="font-semibold">{sourceLabel}</span>
        {vanId && (
          <Link href={`/print/stock/${vanId}`} target="_blank" className="ms-auto inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 hover:bg-secondary">
            <Printer className="h-3.5 w-3.5" /> {t('rep.btnVanStock')}
          </Link>
        )}
      </div>

      {lastSale && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-success/40 bg-success/10 p-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span>{t('rep.invoiceDone')} <span className="font-mono" dir="ltr">{lastSale.invoice_number}</span></span>
          <div className="ms-auto flex gap-1">
            <Link href={`/print/invoices/${lastSale.invoice_id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-secondary">
              <Printer className="h-3.5 w-3.5" /> {t('rep.btnPrintInvoice')}
            </Link>
            <Link href={`/print/receipt/${lastSale.invoice_id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-secondary">
              <Printer className="h-3.5 w-3.5" /> {t('rep.btnPrintReceipt')}
            </Link>
            <button onClick={() => setLastSale(null)} className="rounded-md p-1 hover:bg-secondary"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      {todayPlan.length > 0 && (
        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b p-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-primary" /> {t('rep.visitPlanTitle', { count: todayPlan.length })}
          </div>
          <ul className="divide-y">
            {todayPlan.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                <span className="flex items-center gap-2">
                  {visited.has(c.id) && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {c.name}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCustomerId(c.id)}>{t('rep.btnSell')}</Button>
                  {!visited.has(c.id) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onNoSale(c.id)}>{t('rep.btnNoSale')}</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2">
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
          </select>
        )}
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">{t('rep.selectCustomerPlaceholder')}</option>
          {customers.filter((c) => c.is_approved !== false).map((c) => <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('rep.searchProductPlaceholder')} className="h-11 pr-9" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setNewCustomer(true)}>
          <UserPlus className="h-4 w-4" /> {t('rep.btnNewCustomer')}
        </Button>
        <Link href="/inventory/requests" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-secondary">
          <PackagePlus className="h-4 w-4" /> {t('rep.btnLoadRequest')}
        </Link>
        {customerId && (
          <Link href={`/print/statement/${customerId}`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-secondary">
            <FileText className="h-4 w-4" /> {t('rep.btnStatement')}
          </Link>
        )}
      </div>

      {customerId && (
        <Card>
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t('rep.customerAccountTitle')}</span>
              {debtLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {debt ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant={debt.balance > 0 ? 'warning' : 'success'}>{t('rep.debtLabel')} {formatCurrency(debt.balance)}</Badge>
                  {debt.bucket0_30 > 0 && <Badge variant="secondary">{t('rep.agingBucket0_30')} {formatCurrency(debt.bucket0_30)}</Badge>}
                  {debt.bucket31_60 > 0 && <Badge variant="secondary">{t('rep.agingBucket31_60')} {formatCurrency(debt.bucket31_60)}</Badge>}
                  {debt.bucket61_90 > 0 && <Badge variant="secondary">{t('rep.agingBucket61_90')} {formatCurrency(debt.bucket61_90)}</Badge>}
                  {debt.bucket90 > 0 && <Badge variant="destructive">{t('rep.agingBucket90plus')} {formatCurrency(debt.bucket90)}</Badge>}
                </div>
                {debt.invoices.length > 0 ? (
                  <div className="divide-y rounded-md border">
                    {debt.invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                        <div>
                          <span className="font-mono text-xs text-muted-foreground" dir="ltr">{inv.invoice_number}</span>
                          <span className="ms-2 text-xs text-muted-foreground">{t('rep.ageDays', { days: inv.age_days })}</span>
                          <p className="tabular-nums" dir="ltr">{t('rep.remaining')} {formatCurrency(inv.remaining)}</p>
                        </div>
                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!dayOpen}
                          onClick={() => setCollectFor({ id: inv.id, number: inv.invoice_number, remaining: inv.remaining })}>
                          <Wallet className="h-3.5 w-3.5" /> {t('rep.btnCollect')}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('rep.noOpenInvoices')}</p>
                )}
              </>
            ) : (
              !debtLoading && <p className="text-xs text-muted-foreground">{online ? '—' : t('rep.debtOffline')}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        {filtered.map((p) => (
          <button key={p.id} onClick={() => addToCart(p)}
            className="rounded-lg border p-3 text-right active:scale-95 transition-transform">
            <p className="line-clamp-2 text-sm font-medium">{p.name_ar || p.name}</p>
            <p className="mt-1 font-bold tabular-nums text-primary" dir="ltr">{formatCurrency(p.sell_price)}</p>
          </button>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-3 shadow-2xl">
          <div className="mx-auto max-w-md space-y-2">
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {cart.map((l) => (
                <div key={l.product.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.product.name_ar || l.product.name}</span>
                  <button onClick={() => setQty(l.product.id, l.quantity - 1)} className="rounded bg-secondary p-1.5"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-6 text-center tabular-nums" dir="ltr">{l.quantity}</span>
                  <button onClick={() => setQty(l.product.id, l.quantity + 1)} className="rounded bg-secondary p-1.5"><Plus className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setQty(l.product.id, 0)} className="rounded p-1.5 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pay} onChange={(e) => setPay(e.target.checked)} className="h-4 w-4" />
              {t('rep.checkboxCashPayment')}
            </label>
            <Button className="h-12 w-full text-base" disabled={!canSell || submitting} onClick={submit}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              {t('rep.btnCheckout', { amount: formatCurrency(totals.net_amount) })}
            </Button>
          </div>
        </div>
      )}

      {cart.length === 0 && (
        <div className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
          <ShoppingBag className="h-6 w-6" />
          <p>{t('rep.cartEmptyTitle')}</p>
        </div>
      )}

      {collectFor && (
        <CollectDialog
          invoice={collectFor}
          onClose={() => setCollectFor(null)}
          onDone={(invoiceId, invoiceNumber) => {
            setCollectFor(null);
            setLastSale({ invoice_id: invoiceId, invoice_number: invoiceNumber });
            setVisited((prev) => new Set(prev).add(customerId));
            loadDebt(customerId);
          }}
          onSubmit={async (amount, method) => {
            return collectPayment({
              invoice_id: collectFor.id,
              branch_id: branchId,
              customer_id: customerId,
              amount,
              payment_method: method,
            });
          }}
        />
      )}

      {newCustomer && (
        <NewCustomerDialog
          onClose={() => setNewCustomer(false)}
          onSubmit={async (data) => createPendingCustomer({ branch_id: branchId, ...data })}
        />
      )}
      {/* end */}
    </div>
  );
}

function CollectDialog({
  invoice,
  onClose,
  onDone,
  onSubmit,
}: {
  invoice: { id: string; number: string; remaining: number };
  onClose: () => void;
  onDone: (invoiceId: string, invoiceNumber: string) => void;
  onSubmit: (amount: number, method: PaymentMethod) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(invoice.remaining.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [pending, setPending] = useState(false);

  async function go() {
    setPending(true);
    const res = await onSubmit(Number(amount), method);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? t('rep.errorGeneric'));
      return;
    }
    toast.success(t('rep.toastCollected'));
    onDone(invoice.id, invoice.number);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('rep.collectDialogTitle', { number: invoice.number })}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-sm text-muted-foreground">{t('rep.collectRemainingLabel')} <span dir="ltr" className="font-semibold">{formatCurrency(invoice.remaining)}</span></p>
          <Input type="number" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11" />
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="cash">{t('rep.collectMethodCash')}</option>
            <option value="bank_transfer">{t('rep.collectMethodTransfer')}</option>
            <option value="check">{t('rep.collectMethodCheck')}</option>
          </select>
          <Button className="w-full" disabled={pending} onClick={go}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('rep.btnConfirmCollect')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface NewCustomerData {
  code: string;
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  tax_number?: string;
  credit_limit?: number;
  visit_day?: string;
}

function NewCustomerDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: NewCustomerData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useI18n();
  const [f, setF] = useState<NewCustomerData>({ code: '', name: '', credit_limit: 0 });
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<NewCustomerData>) => setF((p) => ({ ...p, ...patch }));

  async function go() {
    setPending(true);
    const res = await onSubmit(f);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? t('rep.errorGeneric'));
      return;
    }
    toast.success(t('rep.toastCustomerSubmitted'));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-sm overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('rep.newCustomerTitle')}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-xs text-warning">{t('rep.newCustomerHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder={t('rep.fieldCustomerCode')} dir="ltr" value={f.code} onChange={(e) => set({ code: e.target.value })} className="h-11" />
            <Input placeholder={t('rep.fieldPhone')} dir="ltr" value={f.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} className="h-11" />
          </div>
          <Input placeholder={t('rep.fieldCustomerName')} value={f.name} onChange={(e) => set({ name: e.target.value })} className="h-11" />
          <Input placeholder={t('rep.fieldCustomerNameAr')} value={f.name_ar ?? ''} onChange={(e) => set({ name_ar: e.target.value })} className="h-11" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder={t('rep.fieldCity')} value={f.city ?? ''} onChange={(e) => set({ city: e.target.value })} className="h-11" />
            <Input placeholder={t('rep.fieldEmail')} dir="ltr" value={f.email ?? ''} onChange={(e) => set({ email: e.target.value })} className="h-11" />
          </div>
          <Input placeholder={t('rep.fieldAddress')} value={f.address ?? ''} onChange={(e) => set({ address: e.target.value })} className="h-11" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder={t('rep.fieldTaxNumber')} dir="ltr" value={f.tax_number ?? ''} onChange={(e) => set({ tax_number: e.target.value })} className="h-11" />
            <Input placeholder={t('rep.fieldCreditLimit')} type="number" step="0.01" dir="ltr" value={f.credit_limit ?? 0} onChange={(e) => set({ credit_limit: Number(e.target.value) })} className="h-11" />
          </div>
          <select value={f.visit_day ?? ''} onChange={(e) => set({ visit_day: e.target.value })} className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t('rep.fieldVisitDay')}</option>
            {VISIT_DAYS.map((d) => <option key={d.value} value={d.value}>{d.ar}</option>)}
          </select>
          <Button className="w-full" disabled={pending || !f.code.trim() || !f.name.trim()} onClick={go}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('rep.btnSubmitForApproval')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
