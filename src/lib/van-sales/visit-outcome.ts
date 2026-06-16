// Visit outcome — every visit must produce a measurable outcome (no empty
// visits). This client store (sessionStorage, per customer) spans the in-visit
// navigation (cockpit → sell/collect/return → cockpit) so the cockpit knows an
// outcome was recorded and can enable "End Visit". Types are shared with the
// server action that persists the outcome. Pure-ish (SSR-guarded).

export type VisitOutcomeKind =
  | 'new_sale'
  | 'collection'
  | 'return'
  | 'no_sale'
  | 'customer_closed'
  | 'not_available'
  | 'gps_exception'
  | 'other';

/** The transaction outcomes (set automatically on a successful sale/collect/return). */
export const TXN_OUTCOMES: VisitOutcomeKind[] = ['new_sale', 'collection', 'return'];

/** Non-transaction outcomes captured via the cockpit outcome sheet. */
export const NON_TXN_OUTCOMES: VisitOutcomeKind[] = ['no_sale', 'customer_closed', 'not_available', 'gps_exception', 'other'];

/** Every non-transaction outcome requires a free-text reason/note (no empty
 *  outcomes — No Sale, Customer Closed, Not Available, GPS Exception, Other). */
export function outcomeNeedsReason(o: VisitOutcomeKind): boolean {
  return NON_TXN_OUTCOMES.includes(o);
}

/** Credit control: a customer is blocked (New Sale disabled) when overdue OR over
 *  the credit limit. "Over limit" only applies when a limit exists — a cash-only
 *  customer (limit = 0) is never blocked for being over limit. */
export function isCreditBlocked(s: { overdueAmount: number; availableCredit: number; creditLimit: number }): boolean {
  const overLimit = s.creditLimit > 0 && s.availableCredit < 0;
  return s.overdueAmount > 0 || overLimit;
}

/** The EFFECTIVE credit block after the Admin Credit Override: a standing block
 *  (overdue / over-limit) still blocks New Sale and constrains End Visit UNLESS an
 *  authorized role may override it (cash sale only, when company policy permits).
 *  Cash-only customers (limit 0) are not "blocked" — they are never over-limit and
 *  override does not apply to them. */
export function creditEffectivelyBlocked(creditBlocked: boolean, canOverrideCredit: boolean): boolean {
  return creditBlocked && !canOverrideCredit;
}

/** Whether "End Visit" is allowed: an outcome must be recorded, and for a credit-
 *  blocked customer it must be a Collection or a No Sale. */
export function canEndVisit(outcome: VisitOutcomeKind | null, creditBlocked: boolean): boolean {
  if (!outcome) return false;
  if (creditBlocked) return outcome === 'collection' || outcome === 'no_sale';
  return true;
}

const KEY = (id: string) => `kako.visitoutcome.${id}`;

export function setVisitOutcome(customerId: string, outcome: VisitOutcomeKind): void {
  if (typeof window === 'undefined' || !customerId) return;
  try { window.sessionStorage.setItem(KEY(customerId), outcome); } catch { /* best-effort */ }
}

export function getVisitOutcome(customerId: string): VisitOutcomeKind | null {
  if (typeof window === 'undefined' || !customerId) return null;
  try { return (window.sessionStorage.getItem(KEY(customerId)) as VisitOutcomeKind) || null; } catch { return null; }
}

export function clearVisitOutcome(customerId: string): void {
  if (typeof window === 'undefined' || !customerId) return;
  try { window.sessionStorage.removeItem(KEY(customerId)); } catch { /* noop */ }
}

export function hasVisitOutcome(customerId: string): boolean {
  return getVisitOutcome(customerId) != null;
}
