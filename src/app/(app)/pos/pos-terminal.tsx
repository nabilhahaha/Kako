'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, Plus, Minus, X, Trash2, StickyNote, UtensilsCrossed, ShoppingBag, Bike,
  RefreshCw, Image as ImageIcon, CheckCircle2, Keyboard, CreditCard, Banknote, Wallet, CloudOff, Printer,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { ScanButton, type ScanResult } from '@/components/scanning/scanner';
import { usePosDevices } from './devices/use-pos-devices';
import { usePosOnline } from './devices/use-pos-online';
import { localStorageStore, memoryStore } from './offline/offline-store';
import { useOfflineSync } from './offline/use-offline-sync';
import { newOfflineSale, tempNumber, type OfflineSalePayload } from './offline/offline-queue';
import { printOfflineReceipt } from './offline/offline-receipt';
import { loadPrintSettings, receiptQuery, type PosPrintSettings } from './print-settings';
import {
  getPosBootstrap, posCheckout, type PosProduct, type PosCategory, type PosTable,
} from './pos-actions';
import {
  addToCart, incQty, decQty, removeLine, setLineNote, cartTotals, changeDue, balanceDue,
  quickCashOptions, DEFAULT_CHARGES, type CartLine, type CartCharges, type OrderMode,
} from './pos-cart';

const MODE_ICON = { dine_in: UtensilsCrossed, takeaway: ShoppingBag, delivery: Bike } as const;
type Method = 'cash' | 'card' | 'mixed';
const METHOD_ICON = { cash: Banknote, card: CreditCard, mixed: Wallet } as const;

/** The last completed sale, retained ONLY in memory for the Reprint action (no extra storage). */
type LastSale =
  | { kind: 'online'; invoiceId: string; orderId: string; method: Method; received: number | null; change: number | null }
  | { kind: 'offline'; tempNumber: string; lines: CartLine[]; total: number; method: Method; received: number | null; change: number | null };

export function PosTerminal({ companyId, outletName, cashierName }: { companyId: string; outletName?: string; cashierName?: string }) {
  const { t, locale } = useI18n();
  const devices = usePosDevices();
  const online = usePosOnline();
  const store = useMemo(() => (typeof window !== 'undefined' && companyId ? localStorageStore(companyId) : memoryStore()), [companyId]);
  const sync = useOfflineSync(store, online);
  const ar = locale === 'ar';
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<PosCategory[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [charges] = useState<CartCharges>(DEFAULT_CHARGES);
  const [mode, setMode] = useState<OrderMode>('takeaway');
  const [tableId, setTableId] = useState<string>('');
  const [orderNote, setOrderNote] = useState('');
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pickList, setPickList] = useState<PosProduct[] | null>(null);
  // Inline payment state (in-cart, matching a real cashier terminal — no modal).
  const [method, setMethod] = useState<Method>('cash');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(1);
  const [printSettings, setPrintSettings] = useState<PosPrintSettings>(() => loadPrintSettings(companyId));
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const manualRef = useRef<HTMLInputElement | null>(null);

  // Keep print settings live if the manager changes them (this tab or another).
  useEffect(() => {
    const refresh = () => setPrintSettings(loadPrintSettings(companyId));
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, [companyId]);

  const pname = useCallback((p: { name: string; nameAr: string | null }) => (ar && p.nameAr) || p.name, [ar]);

  const load = useCallback(async () => {
    setLoading(true);
    // Wrap the server call so an offline reload (network throw) falls back to the cached menu
    // instead of breaking the screen — the cashier keeps selling against cached catalog.
    let ok = false;
    try {
      const res = await getPosBootstrap();
      if (res.ok) {
        setProducts(res.data.products); setCategories(res.data.categories); setTables(res.data.tables);
        store.cacheMenu(res.data);   // refresh the offline menu cache while online
        ok = true;
      }
    } catch { /* offline / network error → use cache below */ }
    if (!ok) {
      const cached = store.getMenu<{ products: PosProduct[]; categories: PosCategory[]; tables: PosTable[] }>();
      if (cached) { setProducts(cached.products); setCategories(cached.categories); setTables(cached.tables); }
    }
    setLoading(false);
  }, [store]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (manualOpen) manualRef.current?.focus(); }, [manualOpen]);

  function flash(msg: string) { setToast(msg); window.setTimeout(() => setToast(null), 1800); }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) =>
      (!cat || p.categoryId === cat) &&
      (!q || p.name.toLowerCase().includes(q) || (p.nameAr ?? '').includes(query.trim()) || (p.code ?? '').toLowerCase().includes(q) || (p.barcode ?? '').includes(q)),
    );
  }, [products, cat, query]);

  const totals = useMemo(() => cartTotals(lines, charges), [lines, charges]);
  const prodById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, (ar && c.nameAr) || c.name])), [categories, ar]);

  function add(p: PosProduct) {
    setLines((prev) => addToCart(prev, { productId: p.id, name: pname(p), price: p.price, taxRate: p.taxRate }));
  }

  // Add by barcode/SKU: exact → add (+qty on repeat); multiple → chooser; none → toast.
  const addByCode = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const matches = products.filter((p) => (p.barcode ?? '') === code || (p.code ?? '') === code);
    if (matches.length === 1) {
      const existed = lines.some((l) => l.productId === matches[0].id);
      add(matches[0]);
      flash(existed ? t('foodPos.scanQtyUp') : t('foodPos.scanAdded'));
    } else if (matches.length > 1) {
      setPickList(matches);
    } else {
      flash(t('foodPos.notFound', { code }));
    }
  }, [products, lines]); // eslint-disable-line react-hooks/exhaustive-deps

  function onScan(r: ScanResult) { addByCode(r.value); }
  function submitManual() { if (manual.trim()) { addByCode(manual); setManual(''); } }

  // Payment maths (inline).
  const tn = Number(received) || 0;
  const change = changeDue(totals.total, tn);
  const due = balanceDue(totals.total, tn);

  function resetOrder() { setLines([]); setOrderNote(''); setTableId(''); setReceived(''); setMethod('cash'); }

  // Print a completed sale's receipt. ONLY the receipt prints (a dedicated print route / window),
  // never the POS screen. Returns false when the print could NOT start (e.g. popup blocked) so the
  // caller can keep the sale and surface a Reprint. Works online (server invoice) and offline
  // (local receipt data) — printing is independent of sync.
  const doPrint = useCallback(async (sale: LastSale): Promise<boolean> => {
    const isCash = sale.method !== 'card';
    if (sale.kind === 'online') {
      const q = receiptQuery(printSettings, { received: isCash ? sale.received : null, change: isCash ? sale.change : null });
      const r = await devices.printer.print({ kind: 'receipt', invoiceId: sale.invoiceId, orderId: sale.orderId, openDrawer: sale.method === 'cash', query: q });
      return r.ok;
    }
    return printOfflineReceipt({
      tempNumber: sale.tempNumber, outlet: outletName ?? '', lines: sale.lines, total: sale.total,
      paperWidth: printSettings.paperWidth, received: isCash ? sale.received : null, change: isCash ? sale.change : null,
      cashier: printSettings.showCashier ? (cashierName ?? null) : null,
      labels: { pending: t('foodPos.pendingSync'), total: t('foodPos.total'), temp: t('foodPos.tempNo'), paid: t('foodPos.tendered'), change: t('foodPos.change') },
    });
  }, [printSettings, devices, outletName, cashierName, t]);

  async function reprint() {
    if (!lastSale) return;
    const ok = await doPrint(lastSale);
    if (!ok) flash(t('foodPos.printFailed'));
  }

  async function pay() {
    if (lines.length === 0 || busy) return;
    setBusy(true);
    const items = lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty, note: l.note }));
    const isCash = method !== 'card';
    const recv = isCash ? tn : null;
    const chg = isCash ? change : null;
    try {
      if (online) {
        const res = await posCheckout({
          mode, tableId: tableId || null, orderNote,
          discountType: charges.discountType, discountValue: charges.discountValue,
          serviceRate: charges.serviceRate, taxRate: charges.taxRate, deliveryFee: charges.deliveryFee,
          paymentMethod: method, items, clientUuid: crypto.randomUUID(),
        });
        if (res.ok && res.data) {
          const sale: LastSale = { kind: 'online', invoiceId: res.data.invoiceId, orderId: res.data.orderId, method, received: recv, change: chg };
          setLastSale(sale);
          if (method === 'cash' && devices.cashDrawer.canOpen) void devices.cashDrawer.open();
          // Auto-print on success when enabled; keep the sale + offer Reprint if print can't start.
          let printed = true;
          if (printSettings.autoPrint) printed = await doPrint(sale);
          flash(printed
            ? t('foodPos.paid') + (res.data.invoiceNumber ? ` · ${res.data.invoiceNumber}` : '')
            : t('foodPos.printFailed'));
          setTicket((n) => n + 1); resetOrder();
        } else {
          flash(t('foodPos.errPayment'));
        }
      } else {
        // OFFLINE: queue locally (frozen prices + a local temp number). It syncs to an official
        // ZATCA invoice when the connection returns — printing uses the LOCAL data, independent of sync.
        const temp = tempNumber(Date.now());
        const payload: OfflineSalePayload = {
          mode, tableId: tableId || null, customerName: null, customerPhone: null, customerAddress: null,
          deliveryFee: charges.deliveryFee, discountType: charges.discountType, discountValue: charges.discountValue,
          serviceRate: charges.serviceRate, taxRate: charges.taxRate, orderNote: orderNote || null,
          paymentMethod: method, items, capturedTotal: totals.total,
        };
        store.put(newOfflineSale({ localUuid: crypto.randomUUID(), tempNumber: temp, companyId, cashier: cashierName ?? null, createdAt: new Date().toISOString(), sale: payload }));
        sync.refresh();
        const sale: LastSale = { kind: 'offline', tempNumber: temp, lines: [...lines], total: totals.total, method, received: recv, change: chg };
        setLastSale(sale);
        let printed = true;
        if (printSettings.autoPrint) printed = await doPrint(sale);
        flash(printed ? t('foodPos.pendingSync') + ` · ${temp}` : t('foodPos.printFailed'));
        setTicket((n) => n + 1); resetOrder();
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const ticketNo = `#${String(ticket).padStart(3, '0')}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fdf6ec]">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ════ Menu side ════ */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar: search · scan · manual barcode */}
          <div className="flex items-center gap-2 p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('foodPos.search')}
                className="h-11 w-full rounded-xl border border-[#e7d6c2] bg-white ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <ScanButton onScan={onScan} label={t('foodPos.scan')} className="grid h-11 shrink-0 place-items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" />
            <button onClick={() => setManualOpen((v) => !v)}
              className={cn('grid h-11 shrink-0 place-items-center gap-1.5 rounded-xl border border-[#e7d6c2] bg-white px-3 text-sm font-medium', manualOpen && 'ring-2 ring-primary')}>
              <Keyboard className="h-4 w-4" />
            </button>
            <button onClick={() => void load()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e7d6c2] bg-white" aria-label={t('foodPos.refresh')}>
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* Manual barcode entry (toggled) */}
          {manualOpen && (
            <div className="px-3 pb-2">
              <form onSubmit={(e) => { e.preventDefault(); submitManual(); }} className="flex gap-2">
                <input ref={manualRef} value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric"
                  placeholder={t('foodPos.manualBarcode')} className="h-10 flex-1 rounded-xl border border-[#e7d6c2] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
                <button type="submit" aria-label={t('foodPos.scan')} className="grid w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Plus className="h-5 w-5" /></button>
              </form>
            </div>
          )}

          {/* Category tabs */}
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
            <CatTab active={cat === null} onClick={() => setCat(null)}>{t('foodPos.allCategories')}</CatTab>
            {categories.map((c) => (
              <CatTab key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{(ar && c.nameAr) || c.name}</CatTab>
            ))}
          </div>

          {/* Product grid — dense, touch-friendly cards so the cashier sees more at once. */}
          <div className="grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto p-2.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => add(p)}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-[#ecdcc7] bg-white text-start shadow-sm transition active:scale-[0.97] hover:border-primary/60 hover:shadow-md">
                <div className="relative aspect-square w-full overflow-hidden bg-[#f6ece0]">
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" />
                    : <ImagePlaceholder />}
                  {/* Add affordance */}
                  <span className="absolute end-1.5 bottom-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow transition group-hover:scale-110">
                    <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-0 p-1.5">
                  <span className="line-clamp-2 text-[12px] font-semibold leading-tight">{pname(p)}</span>
                  <span className="mt-0.5 text-[13px] font-extrabold text-primary tabular-nums">{p.price.toFixed(2)}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="col-span-full py-16 text-center text-sm text-muted-foreground">{t('foodPos.cartEmpty')}</div>}
          </div>
        </div>

        {/* ════ Cart side (Current Order) ════ */}
        <aside className="flex w-full shrink-0 flex-col border-s border-[#e7d6c2] bg-white lg:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#f0e4d4] px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">{t('foodPos.cart')}</h2>
              <span className="text-[11px] text-muted-foreground">{t('foodPos.itemsCount', { n: lines.reduce((s, l) => s + l.qty, 0) })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {lastSale && (
                <button onClick={() => void reprint()} title={t('foodPos.reprint')}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e7d6c2] bg-white px-2 text-[11px] font-semibold text-muted-foreground hover:bg-[#faf1e6]">
                  <Printer className="h-3.5 w-3.5" /> {t('foodPos.reprint')}
                </button>
              )}
              <span className="rounded-lg bg-[#faf1e6] px-2.5 py-1 font-mono text-xs font-bold text-primary">{ticketNo}</span>
            </div>
          </div>

          {/* Order mode */}
          <div className="grid grid-cols-3 gap-1.5 p-2.5">
            {(['dine_in', 'takeaway', 'delivery'] as const).map((m) => {
              const Icon = MODE_ICON[m];
              return (
                <button key={m} onClick={() => setMode(m)}
                  className={cn('flex flex-col items-center gap-1 rounded-xl border py-2 text-xs font-semibold transition',
                    mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-[#e7d6c2] text-muted-foreground hover:bg-[#faf1e6]')}>
                  <Icon className="h-4 w-4" /> {t(`foodPos.${m === 'dine_in' ? 'dineIn' : m}`)}
                </button>
              );
            })}
          </div>
          {mode === 'dine_in' && tables.length > 0 && (
            <div className="px-2.5 pb-2.5">
              <select value={tableId} onChange={(e) => setTableId(e.target.value)} className="h-9 w-full rounded-lg border border-[#e7d6c2] bg-white px-2 text-sm">
                <option value="">{t('foodPos.selectTable')}</option>
                {tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.name}</option>)}
              </select>
            </div>
          )}

          {/* Lines */}
          <div className="min-h-0 flex-1 overflow-y-auto border-y border-[#f0e4d4]">
            {lines.length === 0 ? (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                <div><ShoppingBag className="mx-auto mb-2 h-8 w-8 opacity-30" />{t('foodPos.cartEmpty')}</div>
              </div>
            ) : (
              <ul className="divide-y divide-[#f4ead9]">
                {lines.map((l) => (
                  <li key={l.productId} className="p-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#f6ece0]">
                        {prodById.get(l.productId)?.imageUrl
                          ? <img src={prodById.get(l.productId)!.imageUrl!} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <span className="grid h-full w-full place-items-center text-muted-foreground"><ImageIcon className="h-4 w-4 opacity-40" /></span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{l.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{l.price.toFixed(2)} × {l.qty} = <b className="text-foreground">{(l.price * l.qty).toFixed(2)}</b></span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setLines(decQty(lines, l.productId))} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e7d6c2]"><Minus className="h-3.5 w-3.5" /></button>
                        <span className="w-5 text-center text-sm font-bold tabular-nums">{l.qty}</span>
                        <button onClick={() => setLines(incQty(lines, l.productId))} className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Plus className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setNoteFor(noteFor === l.productId ? null : l.productId)} className={cn('grid h-7 w-7 place-items-center rounded-lg border border-[#e7d6c2]', l.note && 'border-primary text-primary')}><StickyNote className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setLines(removeLine(lines, l.productId))} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e7d6c2] text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    {noteFor === l.productId && (
                      <input autoFocus defaultValue={l.note ?? ''} onBlur={(e) => { setLines(setLineNote(lines, l.productId, e.target.value)); setNoteFor(null); }}
                        placeholder={t('foodPos.notePlaceholder')} className="mt-1.5 h-8 w-full rounded-lg border border-[#e7d6c2] bg-white px-2 text-xs" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Totals + inline payment */}
          <div className="space-y-2 p-3">
            <Row label={t('foodPos.subtotal')} val={totals.subtotal} />
            {totals.discount > 0 && <Row label={t('foodPos.discount')} val={-totals.discount} />}
            {totals.service > 0 && <Row label={t('foodPos.service')} val={totals.service} />}
            {totals.tax > 0 && <Row label={t('foodPos.tax')} val={totals.tax} />}
            <div className="flex items-center justify-between border-t border-[#f0e4d4] pt-2 text-lg font-extrabold">
              <span>{t('foodPos.total')}</span><span className="text-primary tabular-nums">{totals.total.toFixed(2)}</span>
            </div>

            {/* Payment method */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {(['cash', 'card', 'mixed'] as const).map((m) => {
                const Icon = METHOD_ICON[m];
                return (
                  <button key={m} onClick={() => setMethod(m)}
                    className={cn('flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold transition',
                      method === m ? 'border-primary bg-primary/10 text-primary' : 'border-[#e7d6c2] text-muted-foreground')}>
                    <Icon className="h-4 w-4" /> {t(`foodPos.${m}`)}
                  </button>
                );
              })}
            </div>

            {/* Amount received + change (cash / mixed only) */}
            {method !== 'card' && lines.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {quickCashOptions(totals.total).map((q) => (
                    <button key={q} onClick={() => setReceived(String(q))} className="rounded-lg border border-[#e7d6c2] px-2.5 py-1 text-xs font-medium">{q.toFixed(0)}</button>
                  ))}
                  <button onClick={() => setReceived(totals.total.toFixed(2))} className="rounded-lg border border-[#e7d6c2] px-2.5 py-1 text-xs">{t('foodPos.exact')}</button>
                </div>
                <input value={received} onChange={(e) => setReceived(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal"
                  placeholder={t('foodPos.tendered')} className="h-11 w-full rounded-xl border border-[#e7d6c2] bg-white px-3 text-center text-lg font-bold" />
                <div className="flex items-center justify-between rounded-xl bg-[#faf1e6] px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{change > 0 ? t('foodPos.change') : t('foodPos.balanceDue')}</span>
                  <span className={cn('text-lg font-bold tabular-nums', change > 0 ? 'text-emerald-600' : 'text-foreground')}>{(change > 0 ? change : due).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-0.5">
              <button onClick={() => { if (lines.length && confirm(t('foodPos.clearConfirm'))) resetOrder(); }}
                disabled={lines.length === 0} className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-[#e7d6c2] text-destructive disabled:opacity-40"><Trash2 className="h-5 w-5" /></button>
              <button onClick={() => void pay()} disabled={lines.length === 0 || busy || (!online && method === 'card')}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-lg font-extrabold text-primary-foreground shadow-sm transition active:scale-[0.99] disabled:opacity-40">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                {busy ? t('foodPos.completing') : `${t('foodPos.pay')} · ${totals.total.toFixed(2)}`}
              </button>
            </div>
            {!online && method === 'card' && <p className="text-center text-[11px] font-medium text-amber-700">{t('foodPos.offlinePay')}</p>}
          </div>
        </aside>
      </div>

      {/* Compact offline footer (slim, elegant — not a heavy red banner) */}
      {!online && (
        <div className="flex items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-800">
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
          {t('foodPos.offline')}
          {(sync.counts.pending + sync.counts.failed) > 0 && <span className="font-bold">· {sync.counts.pending + sync.counts.failed} {t('foodPos.pendingSync')}</span>}
        </div>
      )}

      {/* Toast */}
      {toast && <div className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg rtl:translate-x-1/2">{toast}</div>}

      {/* Multi-match chooser */}
      {pickList && (
        <Sheet onClose={() => setPickList(null)} title={t('foodPos.multiMatch')}>
          <ul className="divide-y">
            {pickList.map((p) => (
              <li key={p.id}><button onClick={() => { add(p); setPickList(null); }} className="flex w-full items-center justify-between p-3 text-start hover:bg-secondary">
                <span>{pname(p)}</span><span className="font-bold text-primary">{p.price.toFixed(2)}</span></button></li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

function ImagePlaceholder() {
  // Clean food-style placeholder (no broken-image icon): a warm plate glyph on the cream tile.
  return (
    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#f6ece0] to-[#efdcc6] text-[#c9a071]">
      <UtensilsCrossed className="h-8 w-8 opacity-60" />
    </div>
  );
}

function Row({ label, val }: { label: string; val: number }) {
  return <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><span className="tabular-nums">{val.toFixed(2)}</span></div>;
}
function CatTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn('shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition', active ? 'bg-primary text-primary-foreground shadow-sm' : 'border border-[#e7d6c2] bg-white text-muted-foreground hover:bg-[#faf1e6]')}>{children}</button>;
}
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-1 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3"><h3 className="font-semibold">{title}</h3><button onClick={onClose}><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
