// Customer Statement Hub — PURE collection-prioritization logic (no I/O). Turns
// the field "Customer Statement" tile into a collection center: each customer
// carries balance / overdue / oldest-due / credit-limit so the salesman can see
// WHO TO COLLECT FROM FIRST. These helpers classify a status (with badge tone),
// sort by collection priority, and back the quick filters. Pure + tested.

export type HubStatus = 'overdue' | 'credit_blocked' | 'near_due' | 'healthy';

/** A customer row for the statement hub (financials resolved server-side). */
export interface StatementHubCustomer {
  id: string;
  name: string;
  name_ar: string | null;
  code: string;
  balance: number;
  overdueAmount: number;
  oldestDueDate: string | null; // ISO date of the oldest open invoice's due date
  creditLimit: number;
  creditControlEnabled: boolean | null;
  openInvoices: number;         // count of open (unpaid/partially paid) invoices
}

const DAY = 86400000;

function daysUntil(dueIso: string | null, today: string): number | null {
  if (!dueIso) return null;
  const due = Date.parse(dueIso); const now = Date.parse(today);
  if (!Number.isFinite(due) || !Number.isFinite(now)) return null;
  return Math.round((due - now) / DAY);
}

/** Is the customer over their (controlled) credit limit? Pure. */
export function isCreditBlocked(c: StatementHubCustomer): boolean {
  return c.creditControlEnabled !== false && Number(c.creditLimit) > 0 && Number(c.balance) >= Number(c.creditLimit);
}

/** Has the customer any amount past its due date? Pure. */
export function isOverdue(c: StatementHubCustomer, today: string): boolean {
  if (Number(c.overdueAmount) > 0) return true;
  const d = daysUntil(c.oldestDueDate, today);
  return d != null && d < 0;
}

/** Due within the coming `nearDays` (default a week) but not yet overdue. Pure. */
export function isDueThisWeek(c: StatementHubCustomer, today: string, nearDays = 7): boolean {
  if (isOverdue(c, today)) return false;
  const d = daysUntil(c.oldestDueDate, today);
  return d != null && d >= 0 && d <= nearDays;
}

/**
 * Single most-urgent status for the badge. Priority (highest first):
 * Overdue 🔴 → Credit Blocked 🟠 → Near Due 🟡 → Healthy 🟢. Pure.
 */
export function hubStatus(c: StatementHubCustomer, today: string, nearDays = 7): HubStatus {
  if (isOverdue(c, today)) return 'overdue';
  if (isCreditBlocked(c)) return 'credit_blocked';
  if (isDueThisWeek(c, today, nearDays)) return 'near_due';
  return 'healthy';
}

export type HubFilter = 'all' | 'overdue' | 'credit_blocked' | 'due_week' | 'open_invoices';

/** Does a customer match a quick filter? Pure. */
export function matchesFilter(c: StatementHubCustomer, filter: HubFilter, today: string): boolean {
  switch (filter) {
    case 'overdue': return isOverdue(c, today);
    case 'credit_blocked': return isCreditBlocked(c);
    case 'due_week': return isDueThisWeek(c, today);
    case 'open_invoices': return Number(c.openInvoices) > 0;
    case 'all':
    default: return true;
  }
}

/**
 * Collection priority comparator (who to collect from FIRST). Order:
 *   1) Overdue amount, highest first
 *   2) Oldest due date, oldest first (nulls last)
 *   3) Credit limit exceeded first
 *   4) Customer balance, highest first
 * Pure; stable for equal keys.
 */
export function compareForCollection(a: StatementHubCustomer, b: StatementHubCustomer): number {
  if (Number(b.overdueAmount) !== Number(a.overdueAmount)) return Number(b.overdueAmount) - Number(a.overdueAmount);

  const ad = a.oldestDueDate ? Date.parse(a.oldestDueDate) : Number.POSITIVE_INFINITY;
  const bd = b.oldestDueDate ? Date.parse(b.oldestDueDate) : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd; // oldest (smallest timestamp) first

  const ablk = isCreditBlocked(a) ? 1 : 0;
  const bblk = isCreditBlocked(b) ? 1 : 0;
  if (ablk !== bblk) return bblk - ablk; // blocked first

  return Number(b.balance) - Number(a.balance);
}

/** Sort a copy by collection priority. Pure. */
export function sortForCollection(list: StatementHubCustomer[]): StatementHubCustomer[] {
  return [...list].sort(compareForCollection);
}
