// ============================================================================
// Global Tax — tax groups / multi-rate (Phase 5A · M2). Pure, no DB. Builds on the
// M1 VAT engine to apply a SET of tax codes to a line (e.g. VAT + excise, or
// jurisdiction splits):
//   * non-compound (default) — every member applies to the same line base
//   * compound               — each member applies to base + prior members' tax
//                              (tax-on-tax), only where a jurisdiction requires it
// Exclusive (net) amounts (the multi-rate norm); inclusive multi-rate is out of
// M2 scope. Each member produces its own component; the line's NET is counted once
// (components never double-count the base). Reuses M1's per-code computation.
// ============================================================================

import { computeTax, type TaxCodeRef, type ResolvedTaxLine, type TaxBreakdown, type ComputeTaxOptions } from './vat';

export interface TaxGroup {
  code: string;
  members: TaxCodeRef[];
  /** Apply members tax-on-tax (each on base + prior tax). Default false. */
  compound?: boolean;
}

export interface GroupedTaxLineInput {
  amount: number;        // net (exclusive) line amount; signed for notes
  group: TaxGroup;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Compute a multi-rate breakdown for grouped lines. Pure. Net counts each line
 *  amount once; each member adds a tax component (compound = tax-on-tax). */
export function computeGroupedTax(lines: GroupedTaxLineInput[], opts: ComputeTaxOptions = {}): TaxBreakdown {
  const rounding = opts.rounding ?? 'line';
  const components: ResolvedTaxLine[] = [];
  const taxByCode: Record<string, number> = {};
  let net = 0;

  for (const l of lines) {
    net = round2(net + l.amount);
    let priorTax = 0;
    for (const member of l.group.members) {
      const componentBase = l.group.compound ? round2(l.amount + priorTax) : l.amount;
      // Reuse M1 for a single member on this component base (exclusive).
      const single = computeTax([{ amount: componentBase, taxCode: member }], { rounding });
      const tax = single.totalTax;
      components.push({
        base: componentBase,
        taxCode: member.code,
        rate: single.lines[0].rate,
        taxAmount: tax,
        kind: member.kind,
      });
      taxByCode[member.code] = round2((taxByCode[member.code] ?? 0) + tax);
      priorTax = round2(priorTax + tax);
    }
  }

  const totalTax = round2(Object.values(taxByCode).reduce((s, t) => s + t, 0));
  return { lines: components, net, taxByCode, totalTax, gross: round2(net + totalTax) };
}
