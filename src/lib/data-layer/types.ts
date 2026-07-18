/**
 * COMMERCIAL DATA LAYER — canonical types.
 *
 * Core dashboard service (NOT a Promotions feature): one shared model for
 * data acquisition, storage, parsing and validation. Business logic and
 * calculation engines stay inside their modules — Trade Spend and
 * Promotions (and future modules: Customer 360, Claims, Credit Notes,
 * Collections, Analytics) consume these types; none of them own them.
 */

/** One invoice line, at the granularity of the reference raw export.
 * Shape mirrors the frozen ingestion codepath so every consumer sees the
 * exact same data a settlement calculation would see. */
export interface CommercialInvoiceLine {
  invoice: string;
  date: string;
  customerCode: string;
  customerName: string;
  city: string;
  channel: string;
  salesman: string;
  productCode: string;
  productName: string;
  unit: string;
  cases: number;
  /** piece count (Qty Each) when the export carries it */
  each: number;
  price: number;
  net: number;
  gross: number;
  /** FREE when net === 0 (reference rule); PAID otherwise */
  type: 'PAID' | 'FREE';
  isReturn: boolean;
  /** where this line came from */
  source: 'upload' | 'audited';
  sourceId: string;
}

/** Aggregate transaction in the exact shape Trade Spend consumes
 * (`SalesTransaction` in src/lib/trade-spend/types.ts). */
export interface CommercialSalesTransaction {
  id: string;
  account: string;
  item_id: string;
  date: string;
  value_ex_vat: number;
  cases: number;
}

export interface CommercialCustomer {
  code: string;
  name: string;
  city: string;
  channel: string;
  /** master = reference master data; pool = discovered in uploaded invoices */
  origin: 'master' | 'pool';
}

export interface CommercialProduct {
  code: string;
  name: string;
  group: string;
  origin: 'master' | 'pool';
}

/** A stored upload batch (the import-history unit). Mirrors the reference
 * data-pool batch shape 1:1 — same IndexedDB store, same fields. */
export interface CommercialBatch {
  id: string;
  name: string;
  addedAt: number;
  from: string;
  to: string;
  nInv: number;
  nRows: number;
}

export type UploadJobStatus = 'parsed' | 'stored' | 'failed';

/** Result of running a file through the shared pipeline. */
export interface UploadJob {
  id: string;
  fileName: string;
  status: UploadJobStatus;
  at: number;
  /** header names rewritten by the (verbatim) header-repair step */
  renamed: Array<{ from: string; to: string }>;
  /** headers actually found in the file — surfaced on validation failure */
  headersFound: string[];
  error?: string;
  summary?: {
    nRows: number;
    nInvoices: number;
    from: string;
    to: string;
    freeValue: number;
    customers: number;
    products: number;
  };
  batchId?: string;
}

export interface InvoiceLineFilter {
  source?: 'upload' | 'audited' | 'all';
  /** restrict to one stored batch (import-history unit) */
  batchId?: string;
  dateFromMs?: number;
  dateToMs?: number;
  customerCodes?: string[];
  productCodes?: string[];
}
