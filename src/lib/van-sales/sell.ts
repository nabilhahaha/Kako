// ============================================================================
// Van Sell — PURE core (no I/O). The field rep sells off the van: lines carry
// only product + quantity + an optional discount; the AUTHORITATIVE unit price
// is resolved server-side (erp_resolve_price) and the whole transaction is
// committed atomically by the erp_van_sell RPC. These pure helpers normalize the
// input and validate the discount cap so the thin server wrapper can fail fast
// with friendly errors BEFORE the RPC — the RPC remains the sole authority.
//
// Math mirrors src/lib/erp/sales-calc.ts exactly (net = gross − discount + tax),
// reused here so van-sell totals never diverge from desktop invoicing.
// ============================================================================

import { computeTotals, type LineInput, type DocumentTotals } from '@/lib/erp/sales-calc';

/** What the client submits per line — never a price (resolved server-side).
 *  `uom` is the unit the rep entered (e.g. 'carton'); null/absent = base unit. */
export interface VanSellLineInput {
  product_id: string;
  quantity: number;
  discount_pct?: number;
  uom?: string | null;
}

/** A line after the server resolved its price + tax — input to the totals math. */
export interface PricedVanSellLine extends LineInput {}

/**
 * Drop empty/invalid lines and coerce discount to a sane non-negative number.
 * Keeps only lines with a product and a positive quantity (same contract as the
 * invoice action's `lines.filter(...)`). Pure.
 */
export function normalizeVanSellLines(lines: VanSellLineInput[]): Required<VanSellLineInput>[] {
  return lines
    .filter((l) => l.product_id && Number(l.quantity) > 0)
    .map((l) => ({
      product_id: l.product_id,
      quantity: Number(l.quantity),
      discount_pct: Math.max(0, Number(l.discount_pct ?? 0)),
      uom: (l.uom ?? '').trim() || null,
    }));
}

/** A discount is within cap when no cap is set (null) or it does not exceed it. Pure. */
export function discountWithinCap(discountPct: number, cap: number | null): boolean {
  if (cap === null || cap === undefined) return true;
  return Number(discountPct) <= Number(cap);
}

/**
 * The first line whose discount exceeds the cap, or `null` when all are within
 * cap. Mirrors the RPC's per-line check so the wrapper can reject early. Pure.
 */
export function firstDiscountOverCap(
  lines: VanSellLineInput[],
  cap: number | null,
): VanSellLineInput | null {
  if (cap === null || cap === undefined) return null;
  return lines.find((l) => !discountWithinCap(Number(l.discount_pct ?? 0), cap)) ?? null;
}

/**
 * Van-sell document totals from server-priced lines. Thin, intentional wrapper
 * over the shared `computeTotals` so the van-sell path and the invoice path
 * produce identical numbers. Pure.
 */
export function computeVanSellTotals(lines: PricedVanSellLine[]): DocumentTotals {
  return computeTotals(lines);
}

// ============================================================================
// Collection-in-Sell — PURE payment core (no I/O). Mirrors the
// erp_van_sell_with_payment RPC so the Payment-step preview (status + remaining)
// matches exactly what the server commits. The RPC remains the sole authority.
// ============================================================================

/** Is Collection-in-Sell active for this tenant? Opt-in platform flag
 *  (`platform.collect_in_sell`), default OFF. Pure. */
export function collectInSellEnabled(flags: Record<string, boolean | undefined> | null | undefined): boolean {
  return Boolean(flags?.['platform.collect_in_sell']);
}

/** Tender methods supported in-sell (one collection row each on the server).
 *  These are the DB-canonical erp_collections.method codes (constraint-aligned):
 *  cash · credit_card (Card) · bank_transfer · check (Cheque). */
export const PAYMENT_METHODS = ['cash', 'credit_card', 'bank_transfer', 'check'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Methods whose tender must carry a reference (cheque no / bank ref). */
export const REFERENCE_REQUIRED_METHODS: PaymentMethod[] = ['bank_transfer', 'check'];

export interface PaymentTender {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
}

/** Resulting invoice payment status — drives the live status chip + the server. */
export type PaymentStatus = 'paid' | 'partially_paid' | 'credit';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Sum of valid (amount > 0) tenders, rounded to 2dp. Pure. */
export function sumTenders(tenders: PaymentTender[]): number {
  return r2((tenders ?? []).reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0));
}

/** Invoice status from net + amount paid: 0 ⇒ credit, ≥net ⇒ paid, else partial. Pure. */
export function paymentStatusFor(net: number, paid: number): PaymentStatus {
  const n = r2(net);
  const p = r2(paid);
  if (p <= 0) return 'credit';
  if (p >= n) return 'paid';
  return 'partially_paid';
}

/** Invoice outstanding after payment (never negative). Pure. */
export function outstandingAfter(net: number, paid: number): number {
  return Math.max(0, r2(r2(net) - r2(paid)));
}

/** New customer AR balance after this sale: prior + net − paid. Pure. */
export function newBalanceAfter(priorBalance: number, net: number, paid: number): number {
  return r2(r2(priorBalance) + r2(net) - r2(paid));
}

/** Available credit headroom: limit − current outstanding balance (limit>0 only). Pure. */
export function availableCreditFor(creditLimit: number, currentBalance: number): number {
  return r2(r2(creditLimit) - r2(currentBalance));
}

/** Whole days between an ISO date (yyyy-mm-dd) and `today` (ISO). ≥0, null if no date. Pure. */
export function overdueDays(oldestUnpaidISO: string | null | undefined, todayISO: string): number | null {
  if (!oldestUnpaidISO) return null;
  const a = Date.parse(`${oldestUnpaidISO}T00:00:00Z`);
  const b = Date.parse(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/**
 * Is the customer past their allowed credit days? True when credit control is on,
 * a payment-terms window is set, and the oldest unpaid invoice is older than that
 * window (overdue_days > allowed_credit_days). Pure.
 */
export function isOverdueBlocked(
  paymentTermsDays: number | null | undefined,
  oldestUnpaidISO: string | null | undefined,
  todayISO: string,
  creditControlEnabled: boolean = true,
): boolean {
  if (creditControlEnabled === false) return false;
  const terms = Number(paymentTermsDays ?? 0);
  if (!(terms > 0)) return false;
  const od = overdueDays(oldestUnpaidISO, todayISO);
  return od != null && od > terms;
}

/** Default "Near Credit Limit" threshold: warn when available credit drops below
 *  this fraction of the limit (10%). Configurable per call (future: per tenant). */
export const NEAR_LIMIT_DEFAULT_PCT = 0.10;

/** Customer credit standing for the selection badge. Pure. */
export type CreditStatus = 'good' | 'near_limit' | 'over_limit' | 'overdue' | 'cash_only';
export function creditStatusOf(args: {
  creditLimit: number; currentBalance: number; overdue: boolean;
  /** Warn (near_limit) when available < pct × limit. Default 10%. Non-blocking. */
  nearThresholdPct?: number;
}): CreditStatus {
  if (args.overdue) return 'overdue';
  const limit = r2(args.creditLimit);
  if (limit <= 0) return 'cash_only';
  if (r2(args.currentBalance) >= limit) return 'over_limit';
  const available = availableCreditFor(limit, args.currentBalance);
  const pct = args.nearThresholdPct ?? NEAR_LIMIT_DEFAULT_PCT;
  if (available < r2(limit * pct)) return 'near_limit';
  return 'good';
}

/**
 * Would issuing this sale breach the customer's credit control? Mirrors the RPC:
 *   • A FULLY-PAID sale (remaining 0) is always allowed — even for a blocked
 *     customer (so a salesman can still sell for full cash).
 *   • Otherwise: blocked when past credit-days (overdue), cash-only (limit ≤ 0),
 *     or the unpaid remainder exceeds available credit (limit − balance, which is
 *     ≤ 0 once balance ≥ limit). The salesman cannot override (Phase 1). Pure.
 */
export function creditBlocked(
  creditLimit: number, currentBalance: number, net: number, paid: number,
  overdue: boolean = false,
): boolean {
  const unpaid = outstandingAfter(net, paid);
  if (unpaid <= 0) return false;                 // full payment is always allowed
  if (overdue) return true;                       // past credit-days ⇒ no new credit
  if (r2(creditLimit) <= 0) return true;          // cash-only customer
  return unpaid > availableCreditFor(creditLimit, currentBalance);
}

/**
 * Validate tenders against the net BEFORE issuing — mirrors the RPC guards so the
 * UI fails fast: positive amounts, reference required for cheque/transfer, and no
 * overpayment (Σ ≤ net). Returns a stable error token or null. Pure.
 */
export function validateTenders(net: number, tenders: PaymentTender[]): string | null {
  const list = tenders ?? [];
  for (const t of list) {
    if (!(Number(t.amount) > 0)) return 'tender_invalid_amount';
    if (!PAYMENT_METHODS.includes(t.method)) return 'tender_invalid_method';
    if (REFERENCE_REQUIRED_METHODS.includes(t.method) && !String(t.reference ?? '').trim()) {
      return 'tender_reference_required';
    }
  }
  if (sumTenders(list) > r2(net)) return 'payment_exceeds_total';
  return null;
}
