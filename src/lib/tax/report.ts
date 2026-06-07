// ============================================================================
// Global Tax — VAT return / report builder (Phase 5A · M3). Pure, no DB. Rolls
// tax-ledger entries into the headline VAT-return figures: output tax, input tax
// (recoverable), net payable (output − input), with per-code and per-direction
// breakdowns. Country packs (5C/5D) map this generic return onto each authority's
// statutory form; this is the country-agnostic core.
// ============================================================================

import type { TaxKind } from './vat';

export interface TaxLedgerEntry {
  direction: 'output' | 'input';
  taxCode: string;
  base: number;
  tax: number;
  kind?: TaxKind;
}

export interface VatReturn {
  outputTax: number;     // tax collected on sales
  inputTax: number;      // recoverable tax on purchases
  netPayable: number;    // outputTax − inputTax (negative = refund/credit)
  outputBase: number;
  inputBase: number;
  byCode: Record<string, { direction: 'output' | 'input'; base: number; tax: number }>;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Build the generic VAT return from tax-ledger entries (one filing period). Pure. */
export function buildVatReturn(entries: TaxLedgerEntry[]): VatReturn {
  let outputTax = 0, inputTax = 0, outputBase = 0, inputBase = 0;
  const byCode: VatReturn['byCode'] = {};

  for (const e of entries) {
    if (e.direction === 'output') { outputTax += e.tax; outputBase += e.base; }
    else { inputTax += e.tax; inputBase += e.base; }
    const key = `${e.direction}:${e.taxCode}`;
    const slot = byCode[key] ?? (byCode[key] = { direction: e.direction, base: 0, tax: 0 });
    slot.base = round2(slot.base + e.base);
    slot.tax = round2(slot.tax + e.tax);
  }

  outputTax = round2(outputTax); inputTax = round2(inputTax);
  return {
    outputTax,
    inputTax,
    netPayable: round2(outputTax - inputTax),
    outputBase: round2(outputBase),
    inputBase: round2(inputBase),
    byCode,
  };
}
