// ============================================================================
// FMCG Pilot Readiness — PURE evaluator (no I/O). Turns gathered company facts
// into a pass/fail/warn checklist that mirrors the Pilot Runbook Go/No-Go gates
// (incl. the hard UoM/price controls). The server layer gathers the facts under
// RLS and renders the result; this core is fully unit-tested. Read-only: it
// changes nothing — it only reports whether a company is configured to run.
// ============================================================================

export type CheckStatus = 'pass' | 'fail' | 'warn';

export interface ReadinessCheck {
  key: string;
  status: CheckStatus;
  /** true = a No-Go when failed (a warn never blocks). */
  blocking: boolean;
  label: string;
  detail?: string;
}

export interface ReadinessFacts {
  vanSalesActive: boolean;
  salesmenCount: number;
  vans: { assignedTo: string | null; stockUnits: number }[];
  salesmenWithoutVan: string[]; // names/codes for the detail line
  productsTotal: number;
  zeroPricedProducts: string[]; // codes of active products with base price <= 0
  multiUomProducts: string[];   // codes of active products with > 1 active UoM
  customersTotal: number;
  customersApprovedOnBranch: number;
  activeReturnReasons: number;
  allowNegativeVanStock: boolean;
  discountCapPct: number | null;
}

export interface ReadinessReport {
  checks: ReadinessCheck[];
  blockingFailures: number;
  warnings: number;
  ready: boolean;
}

const cap = (n: number, items: readonly string[]) =>
  items.length <= n ? items.join(', ') : `${items.slice(0, n).join(', ')} +${items.length - n} more`;

/** Evaluate a company's FMCG-pilot configuration. Pure. */
export function evaluatePilotReadiness(f: ReadinessFacts): ReadinessReport {
  const checks: ReadinessCheck[] = [];
  const add = (key: string, blocking: boolean, status: CheckStatus, label: string, detail?: string) =>
    checks.push({ key, blocking, status, label, detail });

  // 1. Van Sales active (flag + per-company toggle).
  add('van_sales_active', true, f.vanSalesActive ? 'pass' : 'fail',
    'Van Sales is enabled for the company',
    f.vanSalesActive ? undefined : 'Set KAKO_VAN_SALES and erp_van_sales_settings.is_enabled = true.');

  // 2. Reps have assigned vans.
  const assignedVans = f.vans.filter((v) => v.assignedTo).length;
  if (assignedVans === 0) {
    add('reps_have_vans', true, 'fail', 'Each rep has an assigned van',
      'No active van warehouse is assigned to a rep (is_van + assigned_to).');
  } else if (f.salesmenWithoutVan.length > 0) {
    add('reps_have_vans', true, 'warn', 'Each rep has an assigned van',
      `${assignedVans} van(s) assigned; salesmen without a van: ${cap(5, f.salesmenWithoutVan)}.`);
  } else {
    add('reps_have_vans', true, 'pass', 'Each rep has an assigned van', `${assignedVans} assigned.`);
  }

  // 3. Vans carry opening stock (non-blocking — a load can happen day 1).
  const emptyVans = f.vans.filter((v) => v.assignedTo && v.stockUnits <= 0).length;
  add('van_stock', false, emptyVans === 0 ? 'pass' : 'warn', 'Vans carry opening stock',
    emptyVans === 0 ? undefined : `${emptyVans} assigned van(s) have no stock — load before selling.`);

  // 4. PRICE control — every SKU resolves to a positive base price.
  if (f.productsTotal === 0) {
    add('products_priced', true, 'fail', 'Every pilot SKU resolves to a positive price', 'No active products.');
  } else if (f.zeroPricedProducts.length > 0) {
    add('products_priced', true, 'fail', 'Every pilot SKU resolves to a positive price',
      `${f.zeroPricedProducts.length} SKU(s) at price ≤ 0: ${cap(8, f.zeroPricedProducts)}. (sell_price > 0 is not enforced by code.)`);
  } else {
    add('products_priced', true, 'pass', 'Every pilot SKU resolves to a positive price', `${f.productsTotal} active SKU(s).`);
  }

  // 5. UoM-1/UoM-2 — single base UoM per SKU (pilot is base-unit only).
  add('single_base_uom', false, f.multiUomProducts.length === 0 ? 'pass' : 'warn',
    'SKUs operate with a single base UoM',
    f.multiUomProducts.length === 0
      ? undefined
      : `${f.multiUomProducts.length} SKU(s) have multiple UoMs: ${cap(8, f.multiUomProducts)}. Multi-UoM selling is NOT wired — confirm sell unit = stock unit.`);

  // 6. Customers ready (approved + on-branch).
  if (f.customersApprovedOnBranch === 0) {
    add('customers_ready', true, 'fail', 'Approved customers exist on the branch',
      f.customersTotal === 0 ? 'No customers.' : `${f.customersTotal} customer(s) but none approved on-branch.`);
  } else {
    const pending = f.customersTotal - f.customersApprovedOnBranch;
    add('customers_ready', true, pending > 0 ? 'warn' : 'pass', 'Approved customers exist on the branch',
      pending > 0 ? `${f.customersApprovedOnBranch} ready; ${pending} not approved/on-branch.` : `${f.customersApprovedOnBranch} ready.`);
  }

  // 7. Return reasons active (mandatory on every return).
  add('return_reasons', true, f.activeReturnReasons > 0 ? 'pass' : 'fail',
    'At least one active return reason',
    f.activeReturnReasons > 0 ? `${f.activeReturnReasons} active.` : 'Seed/activate erp_return_reasons.');

  // 8. Policy sanity (non-blocking).
  add('policy', false, f.allowNegativeVanStock ? 'warn' : 'pass', 'Van-sales policy is sane',
    f.allowNegativeVanStock
      ? 'allow_negative_van_stock is ON — reps can oversell the van. Recommend OFF for a pilot.'
      : `Negative-stock OFF${f.discountCapPct != null ? `, discount cap ${f.discountCapPct}%` : ', no discount cap'}.`);

  const blockingFailures = checks.filter((c) => c.blocking && c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return { checks, blockingFailures, warnings, ready: blockingFailures === 0 };
}
