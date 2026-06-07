// ============================================================================
// Distribution — payment allocation / collection settlement engine (Phase 3).
// Pure, no DB. Allocates a customer collection across outstanding invoices, so a
// single receipt can settle multiple invoices (the FMCG collections gap). Either
// oldest-first (auto) or caller-specified per-invoice amounts.
//
// Cash-application data-integrity invariants (enforced + tested): never apply more
// than an invoice's outstanding balance; never allocate more than the collection
// amount; any excess is returned as `unapplied` (on-account credit), never lost.
// ============================================================================

export interface OutstandingInvoice {
  id: string;
  outstanding: number;   // remaining balance due (net of prior payments)
  date: string;          // ISO — due date (or invoice date) for oldest-first ordering
}

export interface Allocation {
  invoiceId: string;
  applied: number;
}

export interface AllocationResult {
  allocations: Allocation[];   // only invoices that received a positive amount
  totalApplied: number;
  unapplied: number;           // overpayment → on-account (>= 0)
  fullySettled: string[];      // invoice ids whose outstanding is fully cleared
}

export interface AllocateOptions {
  /** Explicit per-invoice amounts; when omitted, allocate oldest-first. */
  specified?: Record<string, number>;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Allocate `amount` across `invoices`. Pure. Oldest-first unless `specified`. */
export function allocatePayment(
  amount: number,
  invoices: OutstandingInvoice[],
  opts: AllocateOptions = {},
): AllocationResult {
  const payable = invoices.filter((i) => i.outstanding > 0);

  if (opts.specified) {
    return allocateSpecified(amount, payable, opts.specified);
  }

  // Oldest-first: ascending date, stable tie-break by id.
  const ordered = [...payable].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  const allocations: Allocation[] = [];
  const fullySettled: string[] = [];
  let remaining = round2(Math.max(0, amount));

  for (const inv of ordered) {
    if (remaining <= 0) break;
    const applied = round2(Math.min(remaining, inv.outstanding));
    if (applied <= 0) continue;
    allocations.push({ invoiceId: inv.id, applied });
    if (applied >= inv.outstanding - Number.EPSILON) fullySettled.push(inv.id);
    remaining = round2(remaining - applied);
  }

  const totalApplied = round2(allocations.reduce((s, a) => s + a.applied, 0));
  return { allocations, totalApplied, unapplied: round2(Math.max(0, amount) - totalApplied), fullySettled };
}

/** Apply caller-specified amounts, clamped to each invoice's outstanding and to
 *  the total collection amount (never over-apply, never over-allocate). */
function allocateSpecified(
  amount: number,
  payable: OutstandingInvoice[],
  specified: Record<string, number>,
): AllocationResult {
  const byId = new Map(payable.map((i) => [i.id, i]));
  const allocations: Allocation[] = [];
  const fullySettled: string[] = [];
  let budget = round2(Math.max(0, amount));

  for (const [invoiceId, raw] of Object.entries(specified)) {
    const inv = byId.get(invoiceId);
    if (!inv || raw <= 0 || budget <= 0) continue;
    const applied = round2(Math.min(raw, inv.outstanding, budget));
    if (applied <= 0) continue;
    allocations.push({ invoiceId, applied });
    if (applied >= inv.outstanding - Number.EPSILON) fullySettled.push(invoiceId);
    budget = round2(budget - applied);
  }

  const totalApplied = round2(allocations.reduce((s, a) => s + a.applied, 0));
  return { allocations, totalApplied, unapplied: round2(Math.max(0, amount) - totalApplied), fullySettled };
}
