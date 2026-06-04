/** Pure types/constants for the role-home signals (kept out of the 'use server'
 *  action module, which may only export async functions). */

export interface HomeSignals {
  salesMtd: number;            // sum of this month's invoice net_amount (RLS-scoped)
  overdue: number;            // overdue invoices count
  lostCustomers: number;      // customers with no invoice in the last 30 days
  coveragePct: number | null; // caller's open session coverage today (field rep)
}

export const EMPTY_HOME_SIGNALS: HomeSignals = {
  salesMtd: 0,
  overdue: 0,
  lostCustomers: 0,
  coveragePct: null,
};
