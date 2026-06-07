// ============================================================================
// Global Tax — VAT calculation engine (Phase 5A · M1). Pure, no DB. Computes the
// base/tax breakdown for document lines under a tax code, supporting:
//   * exclusive  → tax = base × rate
//   * inclusive  → tax = gross × rate/(100+rate); base = gross − tax
//   * kinds      → standard | zero | exempt | out_of_scope | reverse_charge
//                  (zero = 0% but reportable; exempt/out_of_scope/reverse_charge
//                   carry NO on-document tax; reverse_charge is reported notionally
//                   by the ledger later, not added to the customer's payable here)
//   * rounding   → per-line (default) or per-invoice (round once per tax code)
//   * credit/debit notes → signed amounts via applyNoteAdjustment
//
// Country-agnostic and deterministic — the heart of the Global Tax Engine. Tax
// groups / multi-rate compounding build on this in M2. Amounts are what the tax
// ledger + GL will post (amount-agnostic, same pattern as costing/COGS).
// ============================================================================

export type TaxKind = 'standard' | 'zero' | 'exempt' | 'out_of_scope' | 'reverse_charge';

export interface TaxCodeRef {
  code: string;
  rate: number;   // percent (e.g. 15 = 15%); 0 for zero/exempt/out_of_scope
  kind: TaxKind;
}

export interface TaxLineInput {
  /** Line amount: net (exclusive) or gross (inclusive), per `inclusive`. Signed
   *  (negative for credit-note lines). */
  amount: number;
  taxCode: TaxCodeRef;
}

export interface ResolvedTaxLine {
  base: number;
  taxCode: string;
  rate: number;
  taxAmount: number;
  kind: TaxKind;
}

export interface TaxBreakdown {
  lines: ResolvedTaxLine[];
  net: number;                          // Σ base
  taxByCode: Record<string, number>;    // tax total per code
  totalTax: number;
  gross: number;                        // net + totalTax
}

export interface ComputeTaxOptions {
  /** Line amounts are tax-inclusive (gross). Default false (exclusive/net). */
  inclusive?: boolean;
  /** Rounding policy. 'line' rounds each line's tax; 'invoice' rounds once per code. */
  rounding?: 'line' | 'invoice';
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Only standard + zero produce on-document tax (zero at 0%). Exempt / out-of-scope
 *  / reverse-charge carry no tax on the document. */
function bearsTax(kind: TaxKind): boolean {
  return kind === 'standard' || kind === 'zero';
}

/** Compute the base + tax for one line (unrounded tax; base rounded). */
function computeLine(input: TaxLineInput, inclusive: boolean): { base: number; taxRaw: number; line: Omit<ResolvedTaxLine, 'taxAmount'> } {
  const { amount, taxCode } = input;
  const rate = bearsTax(taxCode.kind) ? Math.max(0, taxCode.rate) : 0;
  let base: number;
  let taxRaw: number;
  if (!bearsTax(taxCode.kind) || rate === 0) {
    base = amount;
    taxRaw = 0;
  } else if (inclusive) {
    taxRaw = (amount * rate) / (100 + rate);
    base = amount - taxRaw;
  } else {
    base = amount;
    taxRaw = (base * rate) / 100;
  }
  return { base: round2(base), taxRaw, line: { base: round2(base), taxCode: taxCode.code, rate, kind: taxCode.kind } };
}

/** Compute the VAT breakdown for a set of lines. Pure. Handles signed amounts
 *  (credit notes). */
export function computeTax(lines: TaxLineInput[], opts: ComputeTaxOptions = {}): TaxBreakdown {
  const inclusive = opts.inclusive ?? false;
  const rounding = opts.rounding ?? 'line';

  const computed = lines.map((l) => computeLine(l, inclusive));

  // Per-invoice rounding: sum raw tax per code, then round once.
  const rawByCode: Record<string, number> = {};
  for (const c of computed) rawByCode[c.line.taxCode] = (rawByCode[c.line.taxCode] ?? 0) + c.taxRaw;

  const resolved: ResolvedTaxLine[] = computed.map((c) => ({
    ...c.line,
    taxAmount: rounding === 'line' ? round2(c.taxRaw) : c.taxRaw, // invoice mode rounds at code level below
  }));

  const taxByCode: Record<string, number> = {};
  if (rounding === 'invoice') {
    for (const [code, raw] of Object.entries(rawByCode)) taxByCode[code] = round2(raw);
    // distribute nothing further — line taxAmount left unrounded is for reference;
    // normalise line taxAmount to rounded value proportionally is out of scope for M1,
    // so we round line amounts too for a consistent return.
    for (const r of resolved) r.taxAmount = round2(r.taxAmount);
  } else {
    for (const r of resolved) taxByCode[r.taxCode] = round2((taxByCode[r.taxCode] ?? 0) + r.taxAmount);
  }

  const net = round2(resolved.reduce((s, r) => s + r.base, 0));
  const totalTax = round2(Object.values(taxByCode).reduce((s, t) => s + t, 0));
  return { lines: resolved, net, taxByCode, totalTax, gross: round2(net + totalTax) };
}

/** Credit/debit-note adjustment: recompute tax on a signed delta against an
 *  original line's tax code (negative for a credit note, positive for a debit
 *  note). Returns a single-line signed breakdown the ledger nets against the
 *  original. */
export function applyNoteAdjustment(taxCode: TaxCodeRef, deltaAmount: number, opts: ComputeTaxOptions = {}): TaxBreakdown {
  return computeTax([{ amount: deltaAmount, taxCode }], opts);
}
