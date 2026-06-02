/**
 * FP-CS: Customer Status Blocking.
 *
 * `customer_status` gates NEW business activity only — collections, payments,
 * sales returns and statements are ALWAYS allowed (debt + stock recovery), at
 * every status. This module is the single source of truth for which operations
 * a given status blocks; the DB triggers (migration 0113) are the authoritative
 * enforcement, and the server actions call `statusBlocks` for friendly errors.
 *
 *   active     → nothing blocked
 *   suspended  → no new orders / invoices (route + rep assignment still allowed)
 *   inactive   → archived; treated like suspended for transactions
 *   blocked    → no new orders / invoices / route / rep assignment
 *   (payment + return are never blocked)
 */

export type CustomerOp = 'order' | 'invoice' | 'route' | 'rep' | 'return' | 'payment';

/** Operations that represent NEW business (subject to status gating). */
export const NEW_BUSINESS_OPS: readonly CustomerOp[] = ['order', 'invoice', 'route', 'rep'];

/** True when the given customer status blocks the operation. */
export function statusBlocks(status: string | null | undefined, op: CustomerOp): boolean {
  // Recovery operations are always allowed, regardless of status.
  if (op === 'payment' || op === 'return') return false;
  const s = status ?? 'active';
  switch (s) {
    case 'active':
      return false;
    case 'suspended':
    case 'inactive':
      // Freeze new sales/credit; keep operational links (route/rep).
      return op === 'order' || op === 'invoice';
    case 'blocked':
      // Full new-business stop, including route/rep assignment.
      return op === 'order' || op === 'invoice' || op === 'route' || op === 'rep';
    default:
      return false;
  }
}

/** i18n key for the friendly "operation blocked" message for a status. */
export function statusBlockMessageKey(status: string | null | undefined): string {
  return status === 'blocked' ? 'customers.errCustomerBlocked' : 'customers.errCustomerSuspended';
}
