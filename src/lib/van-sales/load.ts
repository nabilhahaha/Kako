// ============================================================================
// Van Sales — load confirmation + suggested-request domain (Phase B). Pure, no
// I/O. The salesman accept / reject / accept-with-variance handshake over a
// warehouse load manifest, the per-line variance, the quantities that may post
// to van stock (accepted only), and the suggested request quantity from sales
// history (reuses the Suggested Load + forecasting engines — no new forecasting).
// ============================================================================

import { suggestLoadLine } from '@/lib/suggested-load';
import { forecastFromHistory, type ForecastDrivers } from '@/lib/commercial/forecasting/engine';

/** The salesman's load-confirmation outcome (the four buttons + pending). */
export type LoadConfirmationStatus =
  | 'pending'
  | 'accept_full'           // every line accepted == loaded
  | 'accept_partial'        // accepted < loaded (short only), no quality issue
  | 'reject_full'           // nothing accepted
  | 'accept_with_variance'; // extra / damaged / wrong / expiry / other → needs review

export type VarianceReason = 'short' | 'extra' | 'damaged' | 'wrong_item' | 'expiry' | 'other';

export const VARIANCE_REASONS: VarianceReason[] = ['short', 'extra', 'damaged', 'wrong_item', 'expiry', 'other'];

export interface ConfirmationLineInput {
  productId: string;
  loadedQty: number;
  acceptedQty: number;
  reason?: VarianceReason;
  /** Free-text note for the variance. */
  notes?: string;
  /** Reference to an attached photo (reuses field media). */
  photoRef?: string;
}

export interface ResolvedConfirmationLine extends ConfirmationLineInput {
  /** accepted - loaded; negative = short, positive = extra, 0 = exact. */
  varianceQty: number;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Per-line variance (accepted − loaded). Pure. */
export function lineVariance(l: ConfirmationLineInput): number {
  return r3((l.acceptedQty || 0) - (l.loadedQty || 0));
}

export interface ConfirmationResult {
  status: LoadConfirmationStatus;
  lines: ResolvedConfirmationLine[];
  totalLoaded: number;
  totalAccepted: number;
  totalVariance: number;
  hasVariance: boolean;
  /** Any non-clean outcome (partial / reject / with-variance) → warehouse review
   *  (+ supervisor review if the company configures it). */
  requiresReview: boolean;
}

/** Classify a load confirmation into one of the four outcomes. Pure.
 *  - reject_full: nothing accepted.
 *  - accept_full: every line accepted exactly what was loaded.
 *  - accept_with_variance: a review-worthy discrepancy (extra/damaged/wrong/
 *    expiry/other, or accepted > loaded).
 *  - accept_partial: short only (accepted < loaded) with no quality reason. */
export function classifyConfirmation(lines: readonly ConfirmationLineInput[]): ConfirmationResult {
  const resolved: ResolvedConfirmationLine[] = lines.map((l) => ({ ...l, varianceQty: lineVariance(l) }));
  const totalLoaded = r3(resolved.reduce((s, l) => s + (l.loadedQty || 0), 0));
  const totalAccepted = r3(resolved.reduce((s, l) => s + (l.acceptedQty || 0), 0));
  const hasVariance = resolved.some((l) => l.varianceQty !== 0);

  let status: LoadConfirmationStatus;
  if (totalAccepted <= 0) status = 'reject_full';
  else if (!hasVariance) status = 'accept_full';
  else {
    const reviewWorthy = resolved.some((l) => l.varianceQty > 0 || (l.reason && l.reason !== 'short'));
    status = reviewWorthy ? 'accept_with_variance' : 'accept_partial';
  }
  return {
    status,
    lines: resolved,
    totalLoaded,
    totalAccepted,
    totalVariance: r3(totalAccepted - totalLoaded),
    hasVariance,
    requiresReview: status !== 'accept_full', // classify() never yields 'pending'
  };
}

/** Quantities that may post to van stock on confirmation — the ACCEPTED qty per
 *  line (loaded qty never posts directly; only confirmation does). Pure. */
export function postableQuantities(lines: readonly ConfirmationLineInput[]): { productId: string; qty: number }[] {
  return lines
    .filter((l) => (l.acceptedQty || 0) > 0)
    .map((l) => ({ productId: l.productId, qty: r3(l.acceptedQty) }));
}

/** A non-negative variance reason is required whenever accepted ≠ loaded. Returns
 *  the product ids missing a reason (empty = OK). Pure. */
export function missingVarianceReasons(lines: readonly ConfirmationLineInput[]): string[] {
  return lines.filter((l) => lineVariance(l) !== 0 && !l.reason).map((l) => l.productId);
}

/** Product ids whose accepted qty is invalid — negative, or greater than loaded
 *  (you can never accept more than the warehouse loaded). Pure. */
export function invalidAcceptedQuantities(lines: readonly ConfirmationLineInput[]): string[] {
  return lines
    .filter((l) => (l.acceptedQty || 0) < 0 || (l.acceptedQty || 0) > (l.loadedQty || 0))
    .map((l) => l.productId);
}

// ── Suggested request quantity (reuse Suggested Load + forecasting) ───────────

/** Suggested quantity to request for a SKU, from recent per-period sales history
 *  and current van stock — reuses forecastFromHistory + suggestLoadLine (no new
 *  forecasting logic). `safetyPct` buffers over demand (default 10%). Pure. */
export function suggestedRequestQty(
  history: readonly number[],
  currentVanStock: number,
  opts: { drivers?: ForecastDrivers; safetyPct?: number } = {},
): number {
  if (!history.length) return 0;
  const projectedDemand = forecastFromHistory(history, opts.drivers);
  return suggestLoadLine({
    productId: '_',
    projectedDemand,
    currentVanStock: currentVanStock || 0,
    safetyPct: opts.safetyPct,
  }).suggestedLoad;
}

// ── Supervisor adjustment audit (before/after) ───────────────────────────────

export interface RequestLineQty { productId: string; quantity: number }

export interface RequestLineChange {
  productId: string;
  before: number | null; // null = line added by the supervisor
  after: number | null;  // null = line removed
}

/** Diff a request's lines before vs after a supervisor adjustment, for the audit
 *  trail (added / removed / changed quantities). Pure. */
export function diffRequestLines(
  before: readonly RequestLineQty[],
  after: readonly RequestLineQty[],
): RequestLineChange[] {
  const b = new Map(before.map((l) => [l.productId, l.quantity]));
  const a = new Map(after.map((l) => [l.productId, l.quantity]));
  const keys = new Set<string>([...b.keys(), ...a.keys()]);
  const changes: RequestLineChange[] = [];
  for (const productId of keys) {
    const bv = b.has(productId) ? b.get(productId)! : null;
    const av = a.has(productId) ? a.get(productId)! : null;
    if (bv !== av) changes.push({ productId, before: bv, after: av });
  }
  return changes;
}
