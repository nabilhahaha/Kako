'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { quickSale, logNoSaleVisit } from '../sales/pos/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import { formatCurrency } from '@/lib/utils';
import type { Branch, ErpCustomer, PaymentMethod, ProductCatalog } from '@/lib/erp/types';
import { Search, Plus, Minus, Trash2, Wifi, WifiOff, RefreshCw, ShoppingBag, CheckCircle2, Loader2, Printer, MapPin, Warehouse } from 'lucide-react';
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
}: {
  customers: ErpCustomer[];
  branches: Branch[];
  products: ProductCatalog[];
  sourceLabel: string;
  todayPlan: PlanCustomer[];
  visitedToday: string[];
}) {
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
    setCustomerId((c) => c || customers[0]?.id || '');
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
    if (done > 0) toast.success(`تمت مزامنة ${done} فاتورة`);
  }, []);

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
        toast.error(res.error ?? 'حدث خطأ');
        setSubmitting(false);
        return;
      }
      toast.success(`تمت الفاتورة ${res.data?.invoice_number ?? ''}`);
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
    toast.success('تم حفظ الفاتورة للمزامنة عند عودة الاتصال');
  }

  function onNoSale(custId: string) {
    startTransitionNoSale(custId);
  }
  function startTransitionNoSale(custId: string) {
    logNoSaleVisit({ branch_id: branchId, customer_id: custId }).then((res) => {
      if (!res.ok) toast.error(res.error ?? 'حدث خطأ');
      else {
        toast.success('تم تسجيل زيارة بدون بيع');
        setVisited((prev) => new Set(prev).add(custId));
      }
    });
  }

  const canSell = branchId && customerId && cart.length > 0;

  if (products.length === 0 && customers.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        لا توجد بيانات محفوظة. افتح التطبيق وأنت متصل بالإنترنت مرة واحدة على الأقل لتحميل العملاء والأصناف.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-3 pb-40">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">تطبيق المندوب</h1>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <Button variant="outline" size="sm" onClick={syncQueue} disabled={syncing || !online} className="text-xs">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              بانتظار المزامنة ({queue.length})
            </Button>
          )}
          <Badge variant={online ? 'success' : 'destructive'} className="gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? 'متصل' : 'غير متصل'}
          </Badge>
        </div>
      </div>

      {!online && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          أنت غير متصل — الفواتير ستُحفظ محلياً وتُزامَن تلقائياً عند عودة الإنترنت.
        </div>
      )}

      <div className="flex items-center gap-2 rounded-md border bg-secondary/30 p-2 text-xs">
        <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
        البيع من: <span className="font-semibold">{sourceLabel}</span>
      </div>

      {lastSale && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-success/40 bg-success/10 p-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span>تمت الفاتورة <span className="font-mono" dir="ltr">{lastSale.invoice_number}</span></span>
          <div className="ms-auto flex gap-1">
            <Link href={`/print/invoices/${lastSale.invoice_id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-secondary">
              <Printer className="h-3.5 w-3.5" /> الفاتورة
            </Link>
            <Link href={`/print/receipt/${lastSale.invoice_id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-secondary">
              <Printer className="h-3.5 w-3.5" /> سند التحصيل
            </Link>
            <button onClick={() => setLastSale(null)} className="rounded-md p-1 hover:bg-secondary"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      {todayPlan.length > 0 && (
        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b p-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-primary" /> خطة زيارات اليوم ({todayPlan.length})
          </div>
          <ul className="divide-y">
            {todayPlan.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                <span className="flex items-center gap-2">
                  {visited.has(c.id) && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {c.name}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCustomerId(c.id)}>بيع</Button>
                  {!visited.has(c.id) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onNoSale(c.id)}>بدون بيع</Button>
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
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث عن صنف…" className="h-11 pr-9" />
        </div>
      </div>

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
              تحصيل نقدي فوري
            </label>
            <Button className="h-12 w-full text-base" disabled={!canSell || submitting} onClick={submit}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              إتمام البيع · {formatCurrency(totals.net_amount)}
            </Button>
          </div>
        </div>
      )}

      {cart.length === 0 && (
        <div className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
          <ShoppingBag className="h-6 w-6" />
          <p>اختر الأصناف لإضافتها للفاتورة</p>
        </div>
      )}
    </div>
  );
}
