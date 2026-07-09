/**
 * RULE 2 — For every SKU, the SUM of delivered quantity across ALL Delivery
 * Notes must never exceed the PI quantity (within the configured tolerance).
 */
import { finding, type ValidationRule } from '../types';

export const quantityNotExceedRule: ValidationRule = {
  code: 'QTY_NOT_EXCEED_PI',
  name: 'Delivered quantity within PI',
  description:
    'Summed delivered quantity per SKU must not exceed the ordered PI quantity.',
  requiresExceptionOnFail: true,
  run(ctx) {
    const tolerance = ctx.config.maxQuantityDifference;

    // delivered[piId][sku] = total delivered
    const delivered = new Map<string, Map<string, number>>();
    for (const line of ctx.deliveryNoteLines) {
      if (!line.piId) continue;
      const perSku = delivered.get(line.piId) ?? new Map<string, number>();
      perSku.set(line.sku, (perSku.get(line.sku) ?? 0) + (line.quantity || 0));
      delivered.set(line.piId, perSku);
    }

    const results = [];
    for (const piLine of ctx.piLines) {
      const deliveredQty = delivered.get(piLine.piId)?.get(piLine.sku) ?? 0;
      if (deliveredQty === 0) continue; // nothing delivered yet -> not a RULE 2 concern

      const difference = deliveredQty - piLine.quantity;
      const ok = difference <= tolerance;
      results.push(
        finding({
          ruleCode: this.code,
          ruleName: this.name,
          severity: ok ? 'pass' : 'fail',
          scope: 'sku',
          piId: piLine.piId,
          piNumber: piLine.piNumber,
          sku: piLine.sku,
          message: ok
            ? `SKU ${piLine.sku}: delivered ${deliveredQty} of ${piLine.quantity} — within PI quantity.`
            : `SKU ${piLine.sku}: PI Quantity = ${piLine.quantity}, Delivered = ${deliveredQty}, Difference = ${difference > 0 ? '+' : ''}${difference}. Status FAILED.`,
          details: {
            sku: piLine.sku,
            piQuantity: piLine.quantity,
            delivered: deliveredQty,
            difference,
          },
        }),
      );
    }
    return results;
  },
};
