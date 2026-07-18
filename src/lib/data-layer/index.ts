/**
 * COMMERCIAL DATA LAYER — core dashboard service.
 *
 * Owns data acquisition, storage, parsing, validation, master data and
 * import history for the whole Roshen Dashboard. Trade Spend, Promotions
 * and future modules (Customer 360, Claims, Credit Notes, Collections,
 * Analytics) consume this API instead of building their own pipelines.
 *
 * Boundaries (by design):
 *  - This layer NEVER computes business results. Each module keeps its own
 *    calculation engine and business rules (Promotions' frozen settlement
 *    engine, Trade Spend's ROI engine) and only reads data from here.
 *  - Physical storage and the ingestion codepath are the byte-identical
 *    frozen extracts of the audited reference implementation (same
 *    IndexedDB pool `roshen_platform_datapool_v1`, same BroadcastChannel
 *    `roshen_platform_sync`), so the untouched reference app, the native
 *    Promotions module and every future consumer all see one pool.
 */
import { DataStore, AUDITED_SOURCES } from '../promotions/frozen/data-pool.js';
import { PBData } from '../promotions/frozen/master-data.js';
import { Store } from '../promotions/frozen/store.js';
import { FilterEngine } from '../promotions/frozen/filter-engine.js';
import { fileToMatrix, parseRows } from './parsing';
import type {
  CommercialBatch,
  CommercialCustomer,
  CommercialInvoiceLine,
  CommercialProduct,
  CommercialSalesTransaction,
  InvoiceLineFilter,
  UploadJob,
} from './types';

export * from './types';

const HISTORY_KEY = 'cdl_import_history';
const HISTORY_LIMIT = 100;

let booted: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function broadcast() {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      new BroadcastChannel('roshen_platform_sync').postMessage({ t: Date.now(), src: 'cdl' });
    }
  } catch {
    /* unavailable */
  }
}

/** Idempotent boot: opens the shared pool. Safe to call from any module. */
export function initDataLayer(): Promise<void> {
  if (booted) return booted;
  booted = (async () => {
    await DataStore.init();
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('roshen_platform_sync');
      bc.onmessage = () => emit();
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.includes('roshen')) emit();
      });
    }
    emit();
  })();
  return booted;
}

export function subscribeDataLayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getDataLayerVersion(): number {
  return version;
}

/* ------------------------------------------------------------------ */
/* Upload jobs                                                         */
/* ------------------------------------------------------------------ */

function readHistory(): UploadJob[] {
  return Store.get(HISTORY_KEY, []) as UploadJob[];
}
function writeHistory(jobs: UploadJob[]) {
  Store.set(HISTORY_KEY, jobs.slice(0, HISTORY_LIMIT));
}

/** Run a file through the shared pipeline and, on success, store it as a
 * batch in the shared pool. Every module's upload goes through here. */
export async function uploadCommercialFile(file: File): Promise<UploadJob> {
  await initDataLayer();
  const job: UploadJob = {
    id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    fileName: file.name,
    status: 'failed',
    at: Date.now(),
    renamed: [],
    headersFound: [],
  };
  try {
    const matrix = await fileToMatrix(file);
    const result = parseRows(matrix);
    job.renamed = result.renamed;
    job.headersFound = result.headersFound;
    job.status = 'parsed';

    const batch = {
      id: 'batch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: file.name,
      addedAt: Date.now(),
      from: result.parsed.dateFrom,
      to: result.parsed.dateTo,
      nInv: result.parsed.nInv,
      nRows: result.parsed.nRows,
      invoices: result.invoices,
    };
    await DataStore.add(batch);
    job.status = 'stored';
    job.batchId = batch.id;
    const customers = new Set(result.parsed.lines.map((l) => String(l.custCode || '')).filter(Boolean));
    const products = new Set(result.parsed.lines.map((l) => String(l.code || '')).filter(Boolean));
    job.summary = {
      nRows: result.parsed.nRows,
      nInvoices: result.parsed.nInv,
      from: result.parsed.dateFrom,
      to: result.parsed.dateTo,
      freeValue: result.freeValue,
      customers: customers.size,
      products: products.size,
    };
  } catch (e) {
    const err = e as Error & { headersFound?: string[] };
    job.error = err.message || String(e);
    if (err.headersFound) job.headersFound = err.headersFound;
  }
  writeHistory([job, ...readHistory()]);
  broadcast();
  emit();
  return job;
}

export function getImportHistory(): UploadJob[] {
  return readHistory();
}

export function listBatches(): CommercialBatch[] {
  return (DataStore.batches() as Array<CommercialBatch & { invoices: unknown[] }>).map(
    ({ id, name, addedAt, from, to, nInv, nRows }) => ({ id, name, addedAt, from, to, nInv, nRows }),
  );
}

export async function removeBatch(id: string): Promise<void> {
  await DataStore.remove(id);
  broadcast();
  emit();
}

export function getStorageMode(): 'idb' | 'local' | 'memory' {
  return DataStore.mode as 'idb' | 'local' | 'memory';
}

/* ------------------------------------------------------------------ */
/* Invoice lines & derived transactions                                */
/* ------------------------------------------------------------------ */

interface PoolInvoice {
  inv: string;
  date: string;
  cust: string;
  code: string;
  city: string;
  sales: string;
  channel: string;
  lines: Array<{
    code: string; name: string; unit: string; cases: number; each: number;
    price: number; net: number; gross: number; type: 'PAID' | 'FREE';
  }>;
  isCN?: boolean;
}

function poolInvoices(source: 'upload' | 'audited' | 'all'): Array<{ inv: PoolInvoice; source: 'upload' | 'audited'; sourceId: string }> {
  const out: Array<{ inv: PoolInvoice; source: 'upload' | 'audited'; sourceId: string }> = [];
  const seen = new Set<string>();
  if (source !== 'upload') {
    (AUDITED_SOURCES as Array<{ id: string; data?: { invoices?: PoolInvoice[] } }>).forEach((p) => {
      (p.data?.invoices || []).forEach((inv) => {
        if (seen.has(inv.inv)) return;
        seen.add(inv.inv);
        out.push({ inv, source: 'audited', sourceId: p.id });
      });
    });
  }
  if (source !== 'audited') {
    (DataStore.batches() as Array<{ id: string; invoices?: PoolInvoice[] }>).forEach((b) => {
      (b.invoices || []).forEach((inv) => {
        if (seen.has(inv.inv)) return;
        seen.add(inv.inv);
        out.push({ inv, source: 'upload', sourceId: b.id });
      });
    });
  }
  return out;
}

export function getInvoiceLines(filter: InvoiceLineFilter = {}): CommercialInvoiceLine[] {
  const src = filter.batchId ? 'upload' : filter.source || 'all';
  const custSet = filter.customerCodes ? new Set(filter.customerCodes) : null;
  const prodSet = filter.productCodes ? new Set(filter.productCodes) : null;
  const lines: CommercialInvoiceLine[] = [];
  poolInvoices(src).forEach(({ inv, source, sourceId }) => {
    if (filter.batchId && sourceId !== filter.batchId) return;
    if (custSet && !custSet.has(inv.code)) return;
    if (filter.dateFromMs != null || filter.dateToMs != null) {
      const d = FilterEngine.parseDate(inv.date) as number | null;
      if (d != null) {
        if (filter.dateFromMs != null && d < filter.dateFromMs) return;
        if (filter.dateToMs != null && d > filter.dateToMs) return;
      }
    }
    (inv.lines || []).forEach((l) => {
      if (prodSet && !prodSet.has(l.code)) return;
      lines.push({
        invoice: inv.inv,
        date: inv.date,
        customerCode: inv.code,
        customerName: inv.cust,
        city: inv.city || '',
        channel: inv.channel || '',
        salesman: inv.sales || '',
        productCode: l.code,
        productName: l.name,
        unit: l.unit || '',
        cases: Number(l.cases) || 0,
        each: Number(l.each) || 0,
        price: Number(l.price) || 0,
        net: Number(l.net) || 0,
        gross: Number(l.gross) || 0,
        type: l.net === 0 ? 'FREE' : 'PAID',
        isReturn: Boolean(inv.isCN) || Number(l.cases) < 0,
        source,
        sourceId,
      });
    });
  });
  return lines;
}

/** ISO yyyy-mm-dd for a pool date label (via the frozen date parser). */
function isoOf(dateLabel: string): string {
  const ms = FilterEngine.parseDate(dateLabel) as number | null;
  if (ms == null) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

/** Derive aggregate transactions in the exact shape Trade Spend consumes.
 * Pure data reshaping — no business rule involved: value is the line's
 * ex-VAT net, cases the signed case count (returns stay negative). Every
 * line is included — FREE lines carry value 0, exactly as Trade Spend's own
 * upload pipeline would have ingested the same file. */
export function getSalesTransactions(filter: InvoiceLineFilter = {}): CommercialSalesTransaction[] {
  return getInvoiceLines(filter)
    .map((l, i) => ({
      id: `cdl-${l.invoice}-${i}`,
      account: l.customerCode,
      item_id: l.productCode,
      date: isoOf(l.date),
      value_ex_vat: l.net,
      cases: l.cases,
    }))
    .filter((t) => t.account && t.item_id && t.date);
}

/* ------------------------------------------------------------------ */
/* Consumer bookkeeping                                                */
/* ------------------------------------------------------------------ */

const TS_IMPORTS_KEY = 'cdl_ts_imports';

export interface TradeSpendImportRecord {
  distributorId: string;
  at: number;
  transactions: number;
}

/** Which batches were already handed to Trade Spend, per distributor —
 * guards against double-appending into its transaction store. */
export function getTradeSpendImports(): Record<string, TradeSpendImportRecord[]> {
  return Store.get(TS_IMPORTS_KEY, {}) as Record<string, TradeSpendImportRecord[]>;
}

export function isBatchImportedForDistributor(batchId: string, distributorId: string): boolean {
  return (getTradeSpendImports()[batchId] || []).some((r) => r.distributorId === distributorId);
}

export function markTradeSpendImport(batchId: string, distributorId: string, transactions: number): void {
  const all = getTradeSpendImports();
  all[batchId] = [...(all[batchId] || []), { distributorId, at: Date.now(), transactions }];
  Store.set(TS_IMPORTS_KEY, all);
  emit();
}

/* ------------------------------------------------------------------ */
/* Master data                                                         */
/* ------------------------------------------------------------------ */

export function getCustomers(): CommercialCustomer[] {
  const map = new Map<string, CommercialCustomer>();
  (PBData.customers() as Array<{ code: string; name: string; city?: string; channel?: string }>).forEach((c) => {
    map.set(c.code, { code: c.code, name: c.name, city: c.city || '', channel: c.channel || '', origin: 'master' });
  });
  poolInvoices('upload').forEach(({ inv }) => {
    if (inv.code && !map.has(inv.code)) {
      map.set(inv.code, {
        code: inv.code, name: inv.cust || inv.code,
        city: inv.city || '', channel: inv.channel || '', origin: 'pool',
      });
    }
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getProducts(): CommercialProduct[] {
  const map = new Map<string, CommercialProduct>();
  (PBData.products() as Array<{ code: string; name: string; group?: string }>).forEach((p) => {
    map.set(p.code, { code: p.code, name: p.name, group: p.group || '', origin: 'master' });
  });
  poolInvoices('upload').forEach(({ inv }) => {
    (inv.lines || []).forEach((l) => {
      if (l.code && !map.has(l.code)) {
        map.set(l.code, { code: l.code, name: l.name || l.code, group: '', origin: 'pool' });
      }
    });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
