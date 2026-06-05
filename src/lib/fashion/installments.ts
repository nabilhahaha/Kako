/** Fashion pack — installment math (pure, client-safe, no DB).
 *  Mirrors the schedule generation in erp_fashion_checkout (migration 0146) so
 *  the UI preview matches what the DB will persist. */

export type InstallmentFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface ScheduleRow {
  seqNo: number;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  amount: number;
}

/** Round to 2 decimals (banker-free, matches Postgres round(numeric, 2)). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Add `periods` of the given frequency to an ISO date, returning an ISO date. */
export function addInterval(isoDate: string, frequency: InstallmentFrequency, periods: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * periods);
  else if (frequency === 'biweekly') d.setUTCDate(d.getUTCDate() + 14 * periods);
  else d.setUTCMonth(d.getUTCMonth() + periods);
  return d.toISOString().slice(0, 10);
}

/** The financed amount once an optional down payment is taken off the net. */
export function financedAmount(net: number, downPayment: number): number {
  return round2(Math.max(net - Math.min(Math.max(downPayment, 0), net), 0));
}

/**
 * Build the installment schedule. Every row carries `each = round(financed/count, 2)`
 * except the LAST row, which absorbs the rounding remainder so the rows sum exactly
 * to `financed`. Identical to the SQL in erp_fashion_checkout.
 */
export function buildSchedule(
  financed: number,
  count: number,
  frequency: InstallmentFrequency,
  startDate: string,
): ScheduleRow[] {
  const n = Math.max(Math.floor(count) || 1, 1);
  const fin = round2(Math.max(financed, 0));
  const each = round2(fin / n);
  const rows: ScheduleRow[] = [];
  let acc = 0;
  for (let i = 1; i <= n; i++) {
    const amount = i === n ? round2(fin - acc) : each;
    if (i < n) acc = round2(acc + each);
    rows.push({ seqNo: i, dueDate: addInterval(startDate, frequency, i - 1), amount });
  }
  return rows;
}

export interface PlanProgress {
  total: number;
  paid: number;
  remaining: number;
  overdueCount: number;
}

/** Sum the schedule into total / paid / remaining and count overdue rows. */
export function planProgress(
  rows: { amount: number; paid_amount: number; due_date: string; status: string }[],
  today: string,
): PlanProgress {
  let total = 0;
  let paid = 0;
  let overdueCount = 0;
  for (const r of rows) {
    total = round2(total + r.amount);
    paid = round2(paid + r.paid_amount);
    if (r.status !== 'paid' && r.due_date < today) overdueCount++;
  }
  return { total, paid, remaining: round2(total - paid), overdueCount };
}

/** A schedule row is overdue when it is not fully paid and its due date has passed. */
export function isOverdue(row: { status: string; due_date: string }, today: string): boolean {
  return row.status !== 'paid' && row.due_date < today;
}
