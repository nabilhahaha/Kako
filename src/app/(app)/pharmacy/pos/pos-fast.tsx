'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { computeTotals } from '@/lib/erp/sales-calc';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { Branch, ErpCustomer, PaymentMethod } from '@/lib/erp/types';
import { Search, ScanLine, Plus, Minus, Trash2, Loader2, PauseCircle, PlayCircle, Undo2 } from 'lucide-react';
import {
  pharmacySearch, pharmacyBatches, pharmacyCheckout,
  type PharmacySearchRow, type PharmacyBatch,
} from './actions';

export interface PosFeatureFlags {
  barcodeScan: boolean;
  batchTracking: boolean;
  fefo: boolean;
  holdResume: boolean;
  returns: boolean;
  receiptPrinting: boolean;
  discountApproval: boolean;
}

interface CartLine {
  product_id: string; code: string; name: string; name_ar: string | null;
  unit_price: number; tax_rate: number; quantity: number; discount_pct: number;
  on_hand: number; batch_count: number;
  batches?: PharmacyBatch[]; batch_id?: string | null;
}

interface Hold { id: string; at: number; label: string; customerId: string; lines: CartLine[] }
const HOLDS_KEY = 'vantora_pharmacy_pos_holds';

export function PharmacyPos({
  branches, customers, features, canDiscount, intlLocale,
}: {
  branches: Pick<Branch, 'id' | 'name' | 'name_ar'>[];
  customers: Pick<ErpCustomer, 'id' | 'name' | 'name_ar'>[];
  features: PosFeatureFlags;
  canDiscount: boolean;
  intlLocale: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const money = (n: number) => formatCurrency(n, 'EGP', intlLocale);
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PharmacySearchRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [holds, setHolds] = useState<Hold[]>([]);
  const [showHolds, setShowHolds] = useState(false);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    try { setHolds(JSON.parse(localStorage.getItem(HOLDS_KEY) || '[]')); } catch { /* ignore */ }
  }, []);

  // Debounced fast search.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 1) { setResults([]); return; }
    timer.current = setTimeout(async () => setResults(await pharmacySearch(q)), 140);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  function addRow(r: PharmacySearchRow) {
    setCart((prev) => {
      const ex = prev.find((l) => l.product_id === r.product_id);
      if (ex) return prev.map((l) => (l.product_id === r.product_id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        product_id: r.product_id, code: r.code, name: r.name, name_ar: r.name_ar,
        unit_price: Number(r.sell_price), tax_rate: Number(r.tax_rate), quantity: 1, discount_pct: 0,
        on_hand: Number(r.on_hand), batch_count: r.batch_count,
      }];
    });
    // Batch tracking: load batches; FEFO preselects the earliest-expiry one.
    if (features.batchTracking && r.batch_count > 0) {
      pharmacyBatches(r.product_id).then((batches) => {
        setCart((prev) => prev.map((l) => l.product_id === r.product_id
          ? { ...l, batches, batch_id: features.fefo ? (batches[0]?.id ?? null) : l.batch_id ?? null }
          : l));
      });
    }
    setQuery('');
    setResults([]);
    searchRef.current?.focus();
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Barcode scanners type fast and end with Enter → instant add of the top hit.
    if (e.key === 'Enter' && features.barcodeScan && results[0]) { e.preventDefault(); addRow(results[0]); }
    else if (e.key === 'Enter' && results.length === 1) { e.preventDefault(); addRow(results[0]); }
  }

  function setQty(id: string, qty: number) {
    if (qty <= 0) return setCart((p) => p.filter((l) => l.product_id !== id));
    setCart((p) => p.map((l) => (l.product_id === id ? { ...l, quantity: qty } : l)));
  }
  function setDiscount(id: string, pct: number) {
    setCart((p) => p.map((l) => (l.product_id === id ? { ...l, discount_pct: Math.max(0, Math.min(100, pct)) } : l)));
  }
  function setBatch(id: string, batchId: string) {
    setCart((p) => p.map((l) => (l.product_id === id ? { ...l, batch_id: batchId || null } : l)));
  }

  const totals = useMemo(() => computeTotals(cart.map((l) => ({
    product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price,
    discount_pct: l.discount_pct, tax_rate: l.tax_rate,
  }))), [cart]);

  const overStock = cart.some((l) => l.on_hand > 0 && l.quantity > l.on_hand);
  const change = Math.max(0, (Number(tendered) || 0) - totals.net_amount);
  const canSell = branchId && customerId && cart.length > 0 && !overStock && !pending;

  function persistHolds(next: Hold[]) { setHolds(next); localStorage.setItem(HOLDS_KEY, JSON.stringify(next)); }
  function hold() {
    if (!cart.length) return;
    const label = `${cart.length} ${t('pharmacyPos.items')} · ${money(totals.net_amount)}`;
    persistHolds([{ id: Math.random().toString(36).slice(2), at: Date.now(), label, customerId, lines: cart }, ...holds].slice(0, 20));
    setCart([]); setTendered(''); toast.success(t('pharmacyPos.held'));
    searchRef.current?.focus();
  }
  function resume(h: Hold) {
    setCart(h.lines); setCustomerId(h.customerId); persistHolds(holds.filter((x) => x.id !== h.id));
    setShowHolds(false); searchRef.current?.focus();
  }

  function checkout() {
    start(async () => {
      const res = await pharmacyCheckout({
        branch_id: branchId, customer_id: customerId,
        lines: cart.map((l) => ({
          product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price,
          discount_pct: l.discount_pct, tax_rate: l.tax_rate, batch_id: l.batch_id ?? null,
        })),
        amount: totals.net_amount, payment_method: method,
      });
      if (!res.ok) { toast.error(res.error ?? t('pharmacyPos.checkoutError')); return; }
      const invId = res.data?.invoice_id;
      toast.success(t('pharmacyPos.sold', { number: res.data?.invoice_number ?? '' }));
      setCart([]); setTendered('');
      // Receipt printing ONLY after the committed sale.
      if (features.receiptPrinting && invId) {
        const want = await confirm({
          title: t('pos.receipt.confirmTitle'), message: t('pos.receipt.confirmMsg'),
          confirmText: t('pos.receipt.print'), cancelText: t('shared.skip'),
        });
        if (want) window.open(`/print/pharmacy/receipt/${invId}?autoprint=1`, '_blank', 'noopener');
      }
      searchRef.current?.focus();
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      {/* Search + results */}
      <div className="space-y-3">
        <div className="relative">
          {features.barcodeScan
            ? <ScanLine className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
            : <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
          <Input
            ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
            placeholder={features.barcodeScan ? t('pharmacyPos.searchScan') : t('pharmacyPos.search')}
            className="h-12 ps-10 text-base" autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {results.map((r) => {
            const out = r.on_hand <= 0;
            return (
              <button key={r.product_id} onClick={() => addRow(r)}
                className="rounded-lg border p-3 text-start transition-colors hover:border-primary/60 hover:bg-secondary/40">
                <p className="line-clamp-2 text-sm font-medium">{nm(r)}</p>
                {r.active_ingredient && <p className="line-clamp-1 text-[11px] text-muted-foreground">{r.active_ingredient}</p>}
                <p className="mt-1 flex items-center justify-between">
                  <span className="font-bold tabular-nums text-primary" dir="ltr">{money(Number(r.sell_price))}</span>
                  <span className={`text-[11px] tabular-nums ${out ? 'text-destructive' : 'text-muted-foreground'}`} dir="ltr">
                    {out ? t('pharmacyPos.outOfStock') : `${r.on_hand}`}
                  </span>
                </p>
              </button>
            );
          })}
          {query.trim().length > 0 && results.length === 0 && (
            <p className="col-span-full p-6 text-center text-sm text-muted-foreground">{t('pharmacyPos.noResults')}</p>
          )}
        </div>
      </div>

      {/* Cart / checkout */}
      <Card className="sticky top-4 h-fit">
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap gap-2">
            {branches.length > 1 && (
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                {branches.map((b) => <option key={b.id} value={b.id}>{nm(b)}</option>)}
              </select>
            )}
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm">
              {customers.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}
            </select>
          </div>

          <div className="max-h-[46vh] space-y-2 overflow-y-auto border-y py-2">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('pharmacyPos.empty')}</p>
            ) : cart.map((l) => {
              const over = l.on_hand > 0 && l.quantity > l.on_hand;
              return (
                <div key={l.product_id} className="space-y-1 border-b pb-2 last:border-0">
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{nm(l)}</span>
                    <button onClick={() => setQty(l.product_id, 0)} className="rounded p-0.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.product_id, l.quantity - 1)} className="rounded p-1 hover:bg-secondary"><Minus className="h-3.5 w-3.5" /></button>
                    <input type="number" min="0" value={l.quantity} onChange={(e) => setQty(l.product_id, Number(e.target.value))}
                      className={`h-7 w-12 rounded border bg-background text-center text-sm ${over ? 'border-destructive text-destructive' : 'border-input'}`} dir="ltr" />
                    <button onClick={() => setQty(l.product_id, l.quantity + 1)} className="rounded p-1 hover:bg-secondary"><Plus className="h-3.5 w-3.5" /></button>
                    <span className="ms-1 text-xs text-muted-foreground" dir="ltr">× {money(l.unit_price)}</span>
                    {canDiscount && (
                      <input type="number" min="0" max="100" value={l.discount_pct || ''} placeholder={t('pharmacyPos.discPct')}
                        onChange={(e) => setDiscount(l.product_id, Number(e.target.value))}
                        className="ms-auto h-7 w-14 rounded border border-input bg-background px-1 text-center text-xs" dir="ltr" />
                    )}
                    <span className={`${canDiscount ? '' : 'ms-auto'} text-sm font-medium tabular-nums`} dir="ltr">
                      {money(l.quantity * l.unit_price * (1 - (l.discount_pct || 0) / 100))}
                    </span>
                  </div>
                  {over && <p className="text-[11px] text-destructive">{t('pharmacyPos.overStock', { qty: String(l.on_hand) })}</p>}
                  {features.batchTracking && l.batches && l.batches.length > 0 && (
                    <div className="flex items-center gap-1">
                      <select value={l.batch_id ?? ''} onChange={(e) => setBatch(l.product_id, e.target.value)}
                        className="h-7 flex-1 rounded border border-input bg-background px-1 text-[11px]">
                        <option value="">{t('pharmacyPos.selectBatch')}</option>
                        {l.batches.map((b, i) => (
                          <option key={b.id} value={b.id}>
                            {(b.batch_number || '—')} · {b.expiry_date ?? '—'} · {b.qty_on_hand}{features.fefo && i === 0 ? ' · FEFO' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-1 text-sm">
            <Row label={t('pharmacyPos.subtotal')} value={money(totals.total_amount)} />
            {totals.tax_amount > 0 && <Row label={t('pharmacyPos.tax')} value={money(totals.tax_amount)} />}
            <div className="flex justify-between border-t pt-1 text-lg font-bold">
              <span>{t('pharmacyPos.total')}</span><span dir="ltr" className="tabular-nums">{money(totals.net_amount)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm">
              {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m[locale]}</option>)}
            </select>
            {method === 'cash' && (
              <Input type="number" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)}
                placeholder={t('pharmacyPos.tendered')} className="h-9 flex-1" dir="ltr" />
            )}
          </div>
          {method === 'cash' && Number(tendered) > 0 && (
            <Row label={t('pharmacyPos.change')} value={money(change)} />
          )}

          <Button className="h-12 w-full text-base" disabled={!canSell} onClick={checkout}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('pharmacyPos.checkout')} · {money(totals.net_amount)}
          </Button>

          <div className="flex flex-wrap gap-2">
            {features.holdResume && (
              <>
                <Button variant="outline" size="sm" disabled={!cart.length || pending} onClick={hold}>
                  <PauseCircle className="h-4 w-4" /> {t('pharmacyPos.hold')}
                </Button>
                <Button variant="outline" size="sm" disabled={!holds.length} onClick={() => setShowHolds((s) => !s)}>
                  <PlayCircle className="h-4 w-4" /> {t('pharmacyPos.resume')} ({holds.length})
                </Button>
              </>
            )}
            {features.returns && (
              <Button variant="outline" size="sm" onClick={() => router.push('/sales/returns')}>
                <Undo2 className="h-4 w-4" /> {t('pharmacyPos.returns')}
              </Button>
            )}
          </div>

          {features.holdResume && showHolds && holds.length > 0 && (
            <div className="space-y-1 rounded-md border p-2">
              {holds.map((h) => (
                <button key={h.id} onClick={() => resume(h)} className="flex w-full items-center justify-between rounded px-2 py-1 text-start text-xs hover:bg-secondary">
                  <span>{h.label}</span>
                  <span className="text-muted-foreground" dir="ltr">{new Date(h.at).toLocaleTimeString()}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span><span dir="ltr" className="tabular-nums">{value}</span>
    </div>
  );
}
