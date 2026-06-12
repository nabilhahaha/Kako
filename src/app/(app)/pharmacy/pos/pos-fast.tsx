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
import { Search, ScanLine, Plus, Minus, Trash2, Loader2, PauseCircle, PlayCircle, Undo2, History, Camera, Replace, FileText, ShieldAlert } from 'lucide-react';
import { CameraScanner, type ScanResult } from '@/components/scanning/scanner';
import {
  pharmacySearch, pharmacyBatches, pharmacyCheckout, linkBarcodeToProduct, pharmacyAlternatives,
  type PharmacySearchRow, type PharmacyBatch, type PharmacyAlternative,
} from './actions';
import { QuickCustomerCreate } from '@/components/contacts/quick-customer';
import { useOnlineStatus } from '@/lib/offline-sync/use-network';
import { queueSale, listQueuedSales, removeQueuedSale } from '@/lib/pharmacy/offline-queue';
import { WifiOff, RefreshCw } from 'lucide-react';

export interface PosFeatureFlags {
  barcodeScan: boolean;
  scanCamera: boolean;
  batchTracking: boolean;
  fefo: boolean;
  holdResume: boolean;
  returns: boolean;
  receiptPrinting: boolean;
  discountApproval: boolean;
  substitutes: boolean;
  prescriptionCapture: boolean;
  prescriptionRequired: boolean;
  controlledTracking: boolean;
  offlinePos: boolean;
  batchAwareReturns: boolean;
}

interface CartLine {
  product_id: string; code: string; name: string; name_ar: string | null;
  unit_price: number; tax_rate: number; quantity: number; discount_pct: number;
  on_hand: number; batch_count: number; is_controlled?: boolean;
  batches?: PharmacyBatch[]; batch_id?: string | null;
}

interface Hold { id: string; at: number; label: string; customerId: string; lines: CartLine[] }
interface RecentItem { product_id: string; code: string; name: string; name_ar: string | null; unit_price: number; tax_rate: number; on_hand: number; batch_count: number; is_controlled?: boolean }
const HOLDS_KEY = 'vantora_pharmacy_pos_holds';
const RECENT_KEY = 'vantora_pharmacy_pos_recent';

export function PharmacyPos({
  branches, customers, features, canDiscount, canLink, quickCreate, intlLocale, defaultCustomerId,
}: {
  branches: Pick<Branch, 'id' | 'name' | 'name_ar'>[];
  customers: Pick<ErpCustomer, 'id' | 'name' | 'name_ar'>[];
  features: PosFeatureFlags;
  canDiscount: boolean;
  /** May link an unknown scanned barcode to an existing product. */
  canLink: boolean;
  /** Platform Contact Model: inline lightweight customer quick-create allowed. */
  quickCreate: boolean;
  intlLocale: string;
  /** Default "Cash customer" for fast walk-in sales (no selection needed). */
  defaultCustomerId: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const money = (n: number) => formatCurrency(n, 'EGP', intlLocale);
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerList, setCustomerList] = useState(customers);
  const [customerId, setCustomerId] = useState(defaultCustomerId || customers[0]?.id || '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PharmacySearchRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [holds, setHolds] = useState<Hold[]>([]);
  const [showHolds, setShowHolds] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [altFor, setAltFor] = useState<PharmacySearchRow | null>(null);
  const [altResults, setAltResults] = useState<PharmacyAlternative[]>([]);
  const [altLoading, setAltLoading] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [rxOpen, setRxOpen] = useState(features.prescriptionRequired);
  const [rx, setRx] = useState({ patient_name: '', doctor_name: '', rx_number: '', is_controlled: false });
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<PharmacySearchRow[]>([]);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kb = useRef<{ checkout: () => void; hold: () => void; toggleResume: () => void; canSell: boolean }>({
    checkout: () => {}, hold: () => {}, toggleResume: () => {}, canSell: false,
  });

  const focusSearch = () => searchRef.current?.focus();
  useEffect(() => { focusSearch(); }, []);
  useEffect(() => {
    try { setHolds(JSON.parse(localStorage.getItem(HOLDS_KEY) || '[]')); } catch { /* ignore */ }
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')); } catch { /* ignore */ }
  }, []);

  // Global hotkeys: F4 hold · F5 resume · F9 checkout. Registered once; calls the
  // latest handlers via a ref so the keyboard works without touching the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F9') { e.preventDefault(); if (kb.current.canSell) kb.current.checkout(); }
      else if (e.key === 'F4') { e.preventDefault(); kb.current.hold(); }
      else if (e.key === 'F5') { e.preventDefault(); kb.current.toggleResume(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounced fast search.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 1) { setResults([]); return; }
    timer.current = setTimeout(async () => setResults(await pharmacySearch(q)), 140);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  function addItem(p: RecentItem) {
    setCart((prev) => {
      const ex = prev.find((l) => l.product_id === p.product_id);
      if (ex) return prev.map((l) => (l.product_id === p.product_id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        product_id: p.product_id, code: p.code, name: p.name, name_ar: p.name_ar,
        unit_price: p.unit_price, tax_rate: p.tax_rate, quantity: 1, discount_pct: 0,
        on_hand: p.on_hand, batch_count: p.batch_count, is_controlled: p.is_controlled,
      }];
    });
    // Batch tracking: load batches; FEFO preselects the earliest-expiry one.
    if (features.batchTracking && p.batch_count > 0) {
      pharmacyBatches(p.product_id).then((batches) => {
        setCart((prev) => prev.map((l) => l.product_id === p.product_id
          ? { ...l, batches, batch_id: features.fefo ? (batches[0]?.id ?? null) : l.batch_id ?? null }
          : l));
      });
    }
    setQuery('');
    setResults([]);
    focusSearch();
  }

  function addRow(r: PharmacySearchRow) {
    addItem({
      product_id: r.product_id, code: r.code, name: r.name, name_ar: r.name_ar,
      unit_price: Number(r.sell_price), tax_rate: Number(r.tax_rate),
      on_hand: Number(r.on_hand), batch_count: r.batch_count, is_controlled: r.is_controlled,
    });
  }

  // Generic scan handler (camera or hardware). Look up by barcode; add if found,
  // else open the not-found → link dialog. Continuous: the camera stays open.
  async function handleScan(r: ScanResult) {
    const code = r.value.trim();
    if (!code) return;
    const rows = await pharmacySearch(code);
    const hit = rows.find((x) => (x.barcode || '') === code) ?? (rows.length === 1 ? rows[0] : undefined);
    if (hit) { addRow(hit); return; }
    setScanOpen(false);
    setLinkQuery(''); setLinkResults([]);
    setNotFound(code);
  }

  useEffect(() => {
    if (notFound === null) return;
    const q = linkQuery.trim();
    if (q.length < 1) { setLinkResults([]); return; }
    const id = setTimeout(async () => setLinkResults(await pharmacySearch(q)), 160);
    return () => clearTimeout(id);
  }, [linkQuery, notFound]);

  function linkAndAdd(row: PharmacySearchRow) {
    if (!notFound) return;
    start(async () => {
      const res = await linkBarcodeToProduct(row.product_id, notFound);
      if (!res.ok) { toast.error(res.error === 'no_permission' ? t('pharmacyPos.linkError') : (res.error ?? t('pharmacyPos.linkError'))); return; }
      toast.success(t('pharmacyPos.linked'));
      addRow(row);
      setNotFound(null);
    });
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter always adds the first/best hit (barcode scanners end with Enter);
    // ESC cancels the current search and keeps focus for the next scan.
    if (e.key === 'Enter') { if (results[0]) { e.preventDefault(); addRow(results[0]); } }
    else if (e.key === 'Escape') { e.preventDefault(); setQuery(''); setResults([]); }
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
  // A controlled drug in the cart forces the register: patient + Rx number are
  // mandatory (stricter than an ordinary Rx-required tenant). Otherwise, when the
  // tenant simply mandates prescriptions, require patient + (Rx no. or doctor).
  const cartHasControlled = features.controlledTracking && cart.some((l) => l.is_controlled);
  const rxOk = cartHasControlled
    ? (rx.patient_name.trim().length > 0 && rx.rx_number.trim().length > 0)
    : (!features.prescriptionRequired
        || (rx.patient_name.trim().length > 0 && (rx.rx_number.trim().length > 0 || rx.doctor_name.trim().length > 0)));
  const canSell = Boolean(branchId && customerId && cart.length > 0 && !overStock && rxOk) && !pending && !busy;

  // A controlled item forces the Rx panel open and pre-marks the controlled flag.
  useEffect(() => {
    if (cartHasControlled) { setRxOpen(true); setRx((s) => (s.is_controlled ? s : { ...s, is_controlled: true })); }
  }, [cartHasControlled]);

  function persistHolds(next: Hold[]) { setHolds(next); localStorage.setItem(HOLDS_KEY, JSON.stringify(next)); }
  function recordRecent(lines: CartLine[]) {
    const items: RecentItem[] = lines.map((l) => ({
      product_id: l.product_id, code: l.code, name: l.name, name_ar: l.name_ar,
      unit_price: l.unit_price, tax_rate: l.tax_rate, on_hand: l.on_hand, batch_count: l.batch_count, is_controlled: l.is_controlled,
    }));
    const merged = [...items, ...recent.filter((r) => !items.some((i) => i.product_id === r.product_id))].slice(0, 12);
    setRecent(merged);
    localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
  }
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

  const refreshQueued = async () => setQueuedCount((await listQueuedSales()).length);

  // Replay queued offline sales through the idempotent server action. Stops at the
  // first failure (e.g. connectivity dropped again); already-applied keys are no-ops.
  async function drainQueue() {
    if (syncing) return;
    const items = await listQueuedSales();
    if (items.length === 0) { setQueuedCount(0); return; }
    setSyncing(true);
    let done = 0;
    for (const q of items) {
      const res = await pharmacyCheckout({
        branch_id: q.branch_id, customer_id: q.customer_id, lines: q.lines,
        amount: q.amount, payment_method: q.payment_method, prescription: q.prescription ?? null,
        idempotency_key: q.idempotency_key,
      });
      if (res.ok) { await removeQueuedSale(q.idempotency_key); done++; } else break;
    }
    setSyncing(false);
    await refreshQueued();
    if (done > 0) { toast.success(t('pharmacyPos.synced', { count: done })); router.refresh(); }
  }

  // On mount: surface any queued sales and (if online) drain them. Drain again the
  // moment connectivity returns.
  useEffect(() => { refreshQueued(); }, []);
  useEffect(() => { if (online) drainQueue(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [online]);

  // Plain async (NOT useTransition): the receipt confirm() must render immediately.
  // Inside a transition, post-await state updates are deferred → the modal would
  // never paint (it can't settle until the user clicks the modal that isn't shown).
  async function checkout() {
    if (!canSell) return;
    const sold = cart;
    const payload = {
      branch_id: branchId, customer_id: customerId,
      lines: cart.map((l) => ({
        product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price,
        discount_pct: l.discount_pct, tax_rate: l.tax_rate, batch_id: l.batch_id ?? null,
      })),
      amount: totals.net_amount, payment_method: method,
      prescription: features.prescriptionCapture
        ? { patient_name: rx.patient_name, doctor_name: rx.doctor_name, rx_number: rx.rx_number, is_controlled: rx.is_controlled }
        : null,
    };

    // Offline: persist the sale on-device and finish instantly. It replays safely
    // (idempotent) when connectivity returns. No receipt print while offline.
    if (features.offlinePos && !online) {
      const label = `${sold.length} ${t('pharmacyPos.items')} · ${money(totals.net_amount)}`;
      await queueSale({ ...payload, label });
      recordRecent(sold);
      setCart([]); setTendered('');
      setRx({ patient_name: '', doctor_name: '', rx_number: '', is_controlled: false });
      setRxOpen(features.prescriptionRequired);
      await refreshQueued();
      toast.success(t('pharmacyPos.savedOffline'));
      searchRef.current?.focus();
      return;
    }

    setBusy(true);
    const res = await pharmacyCheckout(payload);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? t('pharmacyPos.checkoutError')); return; }
    const invId = res.data?.invoice_id;
    toast.success(t('pharmacyPos.sold', { number: res.data?.invoice_number ?? '' }));
    recordRecent(sold);
    setCart([]); setTendered('');
    setRx({ patient_name: '', doctor_name: '', rx_number: '', is_controlled: false });
    setRxOpen(features.prescriptionRequired);
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
  }

  // Same-active-ingredient substitutes (generics) for a product.
  async function showAlternatives(r: PharmacySearchRow) {
    setAltFor(r); setAltResults([]); setAltLoading(true);
    const a = await pharmacyAlternatives(r.product_id);
    setAltResults(a); setAltLoading(false);
  }

  kb.current = { checkout, hold, toggleResume: () => setShowHolds((s) => !s), canSell };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      {/* Search + results */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            {features.barcodeScan
              ? <ScanLine className="pointer-events-none absolute start-3 top-1/2 h-6 w-6 -translate-y-1/2 text-primary" />
              : <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />}
            <Input
              ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
              placeholder={features.barcodeScan ? t('pharmacyPos.searchScan') : t('pharmacyPos.search')}
              className="h-14 ps-11 text-lg" autoComplete="off" enterKeyHint="enter"
            />
          </div>
          {features.scanCamera && (
            <Button type="button" variant="secondary" className="h-14 shrink-0 gap-1.5 px-4 font-medium" onClick={() => setScanOpen(true)} title={t('pharmacyPos.scan')}>
              <Camera className="h-6 w-6" /> <span>{t('pharmacyPos.scan')}</span>
            </Button>
          )}
        </div>

        {/* Recently sold — instant re-add (shown when not actively searching). */}
        {recent.length > 0 && query.trim().length === 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <History className="h-3.5 w-3.5" /> {t('pharmacyPos.recent')}
            </p>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <button key={r.product_id} onClick={() => addItem(r)}
                  className="rounded-full border px-3 py-2 text-sm font-medium transition-colors hover:border-primary/60 hover:bg-secondary/40">
                  {nm(r)} · <span dir="ltr" className="tabular-nums">{money(r.unit_price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {results.map((r) => {
            const out = r.on_hand <= 0;
            return (
              <div key={r.product_id} className="relative">
                <button onClick={() => addRow(r)}
                  className="min-h-[5rem] w-full rounded-lg border p-4 text-start transition-colors active:scale-[0.98] hover:border-primary/60 hover:bg-secondary/40">
                  <p className="line-clamp-2 pe-6 text-sm font-semibold">{nm(r)}</p>
                  {r.active_ingredient && <p className="line-clamp-1 text-[11px] text-muted-foreground">{r.active_ingredient}</p>}
                  <p className="mt-1 flex items-center justify-between">
                    <span className="text-base font-bold tabular-nums text-primary" dir="ltr">{money(Number(r.sell_price))}</span>
                    <span className={`text-[11px] tabular-nums ${out ? 'text-destructive' : 'text-muted-foreground'}`} dir="ltr">
                      {out ? t('pharmacyPos.outOfStock') : `${r.on_hand}`}
                    </span>
                  </p>
                </button>
                {features.substitutes && out ? (
                  <button type="button" onClick={() => showAlternatives(r)}
                    className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-md bg-primary/10 py-1 text-[11px] font-medium text-primary hover:bg-primary/20">
                    <Replace className="h-3.5 w-3.5" /> {t('pharmacyPos.findAlternatives')}
                  </button>
                ) : features.substitutes ? (
                  <button type="button" onClick={() => showAlternatives(r)} title={t('pharmacyPos.findAlternatives')}
                    className="absolute end-1 top-1 rounded-md border bg-background p-1 text-muted-foreground hover:text-primary">
                    <Replace className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
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
          {features.offlinePos && (!online || queuedCount > 0) && (
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${online ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-destructive/10 text-destructive'}`}>
              {online ? <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> : <WifiOff className="h-4 w-4" />}
              <span className="flex-1">
                {!online && t('pharmacyPos.offlineMode')}
                {online && queuedCount > 0 && t('pharmacyPos.pendingSync', { count: queuedCount })}
              </span>
              {online && queuedCount > 0 && (
                <button type="button" disabled={syncing} onClick={drainQueue} className="font-medium underline">
                  {t('pharmacyPos.syncNow')}
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('pharmacyPos.customerOptional')}</p>
          <div className="flex flex-wrap gap-2">
            {branches.length > 1 && (
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                {branches.map((b) => <option key={b.id} value={b.id}>{nm(b)}</option>)}
              </select>
            )}
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm">
              {customerList.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}
            </select>
            <QuickCustomerCreate
              enabled={quickCreate}
              onCreated={(c) => { setCustomerList((list) => [...list, c]); setCustomerId(c.id); searchRef.current?.focus(); }}
            />
          </div>

          {/* Prescription → Dispense linkage (regulatory record, auto-linked to the
              invoice). Collapsed by default; expanded & required when the tenant
              mandates prescriptions. */}
          {(features.prescriptionCapture || cartHasControlled) && (
            <div className={`rounded-md border ${cartHasControlled ? 'border-destructive/50' : ''}`}>
              <button type="button" onClick={() => setRxOpen((o) => !o)}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm font-medium">
                <FileText className={`h-4 w-4 ${cartHasControlled ? 'text-destructive' : 'text-primary'}`} />
                <span>{t('pharmacyPos.rxTitle')}{(features.prescriptionRequired || cartHasControlled) ? ' *' : ''}</span>
                {cartHasControlled && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">{t('pharmacyPos.controlled')}</span>}
                {!rxOpen && (rx.patient_name || rx.rx_number) && (
                  <span className="ms-auto truncate text-xs text-muted-foreground">{rx.patient_name || rx.rx_number}</span>
                )}
              </button>
              {rxOpen && (
                <div className="grid grid-cols-2 gap-2 border-t p-3">
                  <input value={rx.patient_name} onChange={(e) => setRx((s) => ({ ...s, patient_name: e.target.value }))}
                    placeholder={t('pharmacyPos.rxPatient')} className="col-span-2 h-9 rounded-md border border-input bg-background px-2 text-sm" />
                  <input value={rx.doctor_name} onChange={(e) => setRx((s) => ({ ...s, doctor_name: e.target.value }))}
                    placeholder={t('pharmacyPos.rxDoctor')} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                  <input value={rx.rx_number} onChange={(e) => setRx((s) => ({ ...s, rx_number: e.target.value }))}
                    placeholder={t('pharmacyPos.rxNumber')} dir="ltr" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={rx.is_controlled} onChange={(e) => setRx((s) => ({ ...s, is_controlled: e.target.checked }))} className="h-4 w-4" />
                    {t('pharmacyPos.rxControlled')}
                  </label>
                  {!rxOk && <p className="col-span-2 text-xs text-destructive">{t('pharmacyPos.rxRequired')}</p>}
                </div>
              )}
            </div>
          )}

          <div className="max-h-[46vh] space-y-2 overflow-y-auto border-y py-2">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('pharmacyPos.empty')}</p>
            ) : cart.map((l) => {
              const over = l.on_hand > 0 && l.quantity > l.on_hand;
              return (
                <div key={l.product_id} className="space-y-1 border-b pb-2 last:border-0">
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {features.controlledTracking && l.is_controlled && <ShieldAlert className="me-1 inline h-3.5 w-3.5 text-destructive" />}
                      {nm(l)}
                    </span>
                    <button onClick={() => setQty(l.product_id, 0)} className="rounded p-0.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.product_id, l.quantity - 1)} className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-secondary"><Minus className="h-3.5 w-3.5" /></button>
                    <input type="number" min="0" value={l.quantity} onChange={(e) => setQty(l.product_id, Number(e.target.value))}
                      className={`h-9 w-14 rounded border bg-background text-center text-base font-semibold ${over ? 'border-destructive text-destructive' : 'border-input'}`} dir="ltr" />
                    <button onClick={() => setQty(l.product_id, l.quantity + 1)} className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-secondary"><Plus className="h-3.5 w-3.5" /></button>
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

          <Button className="h-14 w-full text-lg font-bold" disabled={!canSell} onClick={checkout}>
            {(pending || busy) && <Loader2 className="h-5 w-5 animate-spin" />}
            {features.offlinePos && !online ? <WifiOff className="h-5 w-5" /> : null} {t('pharmacyPos.checkout')} · {money(totals.net_amount)}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">{t('pharmacyPos.shortcuts')}</p>

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
              <Button variant="outline" size="sm" onClick={() => router.push(features.batchAwareReturns ? '/pharmacy/returns' : '/sales/returns')}>
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

      {/* Generic scanning framework — continuous camera scan adds items live. */}
      {features.scanCamera && (
        <CameraScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} continuous />
      )}

      {/* Substitutes: same active ingredient, in-stock first. */}
      {altFor !== null && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4" onClick={() => setAltFor(null)}>
          <div className="w-full max-w-md rounded-xl bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{t('pharmacyPos.alternativesFor', { name: nm(altFor) })}</h3>
            {altFor.active_ingredient && <p className="mt-0.5 text-xs text-muted-foreground">{altFor.active_ingredient}</p>}
            <div className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto">
              {altLoading ? (
                <p className="p-4 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></p>
              ) : altResults.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{t('pharmacyPos.noAlternatives')}</p>
              ) : altResults.map((a) => {
                const out = a.on_hand <= 0;
                return (
                  <button key={a.product_id} onClick={() => { addRow(a); setAltFor(null); }}
                    className="flex w-full items-center justify-between gap-2 rounded-md border p-2.5 text-start text-sm hover:bg-secondary">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{nm(a)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[a.manufacturer, a.form, a.strength].filter(Boolean).join(' · ') || a.active_ingredient}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="font-semibold tabular-nums text-primary" dir="ltr">{money(Number(a.sell_price))}</span>
                      <span className={`text-[11px] tabular-nums ${out ? 'text-destructive' : 'text-muted-foreground'}`} dir="ltr">
                        {out ? t('pharmacyPos.outOfStock') : `${t('pharmacyPos.inStock')}: ${a.on_hand}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Scan fallback: unknown barcode → search + link to an existing medicine. */}
      {notFound !== null && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4" onClick={() => setNotFound(null)}>
          <div className="w-full max-w-md rounded-xl bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{t('pharmacyPos.notFoundTitle')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('pharmacyPos.notFoundMsg', { code: notFound })}</p>
            {canLink ? (
              <>
                <Input autoFocus value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder={t('pharmacyPos.linkSearch')} className="mt-3 h-11" />
                <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                  {linkResults.map((r) => (
                    <button key={r.product_id} disabled={pending} onClick={() => linkAndAdd(r)}
                      className="flex w-full items-center justify-between rounded-md border p-2 text-start text-sm hover:bg-secondary">
                      <span className="min-w-0 truncate">{nm(r)}</span>
                      <span className="text-xs text-primary">{t('pharmacyPos.link')}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{t('pharmacyPos.linkError')}</p>
            )}
          </div>
        </div>
      )}
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
