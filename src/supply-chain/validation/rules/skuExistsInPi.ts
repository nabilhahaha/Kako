/**
 * RULE 3 — A SKU that appears on a Delivery Note but not on its PI is an error.
 */
import { finding, type ValidationRule } from '../types';

export const skuExistsInPiRule: ValidationRule = {
  code: 'SKU_EXISTS_IN_PI',
  name: 'Delivered SKU exists on PI',
  description: 'Every SKU on a Delivery Note must exist on the referenced PI.',
  requiresExceptionOnFail: true,
  run(ctx) {
    // Set of "piId::sku" that exist on PIs.
    const piSkus = new Set(ctx.piLines.map((l) => `${l.piId}::${l.sku}`));

    // Deduplicate to one finding per (delivery note, sku).
    const seen = new Set<string>();
    const results = [];
    for (const line of ctx.deliveryNoteLines) {
      if (!line.piId) continue; // RULE 1 covers the missing-PI case.
      const key = `${line.deliveryNoteNumber}::${line.sku}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const exists = piSkus.has(`${line.piId}::${line.sku}`);
      results.push(
        finding({
          ruleCode: this.code,
          ruleName: this.name,
          severity: exists ? 'pass' : 'fail',
          scope: 'sku',
          piId: line.piId,
          piNumber: line.piNumber,
          deliveryNoteNumber: line.deliveryNoteNumber,
          sku: line.sku,
          message: exists
            ? `SKU ${line.sku} on Delivery Note ${line.deliveryNoteNumber} exists on PI ${line.piNumber}.`
            : `SKU ${line.sku} on Delivery Note ${line.deliveryNoteNumber} does not exist on PI ${line.piNumber}.`,
          details: { sku: line.sku, deliveryNote: line.deliveryNoteNumber, piNumber: line.piNumber },
        }),
      );
    }
    return results;
  },
};
