/**
 * Customer 360 — pure tab + status helpers (no I/O, no React). Shared by the
 * Customer360 component and its tests so the tab set and the 4-state status
 * mapping have a single, testable source of truth. Mirrors the existing
 * CustomersManager status logic verbatim (no business-logic change).
 */

/** The canonical, approved Customer 360 facet order. */
export const CUSTOMER_360_TAB_KEYS = [
  'overview',
  'profile',
  'statement',
  'activity',
  'related',
  'audit',
] as const;

export type Customer360Tab = (typeof CUSTOMER_360_TAB_KEYS)[number];

export function isCustomer360Tab(value: string): value is Customer360Tab {
  return (CUSTOMER_360_TAB_KEYS as readonly string[]).includes(value);
}

export type CustomerBadgeState = 'draft' | 'pending' | 'rejected' | 'active' | 'inactive';

/** 4-state status (approval first, then active/suspended) — same order as the
 *  list badge in CustomersManager. */
export function customerBadgeState(c: {
  approval_status?: string | null;
  is_active?: boolean | null;
}): CustomerBadgeState {
  switch (c.approval_status) {
    case 'draft':
      return 'draft';
    case 'pending':
      return 'pending';
    case 'rejected':
      return 'rejected';
    default:
      return c.is_active ? 'active' : 'inactive';
  }
}

/** Whether the record is awaiting an approve/reject decision (gates the
 *  Approve/Reject actions) — identical predicate to CustomersManager. */
export function customerNeedsDecision(c: { approval_status?: string | null }): boolean {
  return c.approval_status === 'pending' || c.approval_status === 'draft' || c.approval_status === 'rejected';
}
