/**
 * RULE 4 — Shelf Life Validation. Every delivered item must have remaining
 * shelf life >= the configured minimum (default 70%). Below that fails and the
 * user must create an Exception. When shelf life cannot be derived, a warning
 * is raised instead of a false failure.
 */
import { computeShelfLife, parseFlexibleDate } from '../../utils/dates';
import { finding, type ValidationRule } from '../types';

export const shelfLifeRule: ValidationRule = {
  code: 'SHELF_LIFE_MIN',
  name: 'Minimum remaining shelf life',
  description:
    'Delivered items must retain at least the configured minimum remaining shelf life.',
  requiresExceptionOnFail: true,
  run(ctx) {
    const minPct = ctx.config.minShelfLifePct;
    const formats = ctx.config.dateFormats;

    const results = [];
    for (const line of ctx.deliveryNoteLines) {
      const expiry = parseFlexibleDate(line.expiryDate, formats);
      const production = parseFlexibleDate(line.productionDate, formats);
      const shelf = computeShelfLife({
        expiry,
        production,
        shelfLifeDays: line.shelfLifeDays,
        now: ctx.now,
      });

      if (shelf.remainingPct == null) {
        results.push(
          finding({
            ruleCode: this.code,
            ruleName: this.name,
            severity: 'warning',
            scope: 'sku',
            piId: line.piId,
            piNumber: line.piNumber,
            deliveryNoteNumber: line.deliveryNoteNumber,
            sku: line.sku,
            message: `SKU ${line.sku} on ${line.deliveryNoteNumber}: shelf life could not be verified — ${shelf.reason}.`,
            details: {
              sku: line.sku,
              remainingDays: shelf.remainingDays,
              reason: shelf.reason ?? null,
            },
          }),
        );
        continue;
      }

      const ok = shelf.remainingPct >= minPct;
      results.push(
        finding({
          ruleCode: this.code,
          ruleName: this.name,
          severity: ok ? 'pass' : 'fail',
          scope: 'sku',
          piId: line.piId,
          piNumber: line.piNumber,
          deliveryNoteNumber: line.deliveryNoteNumber,
          sku: line.sku,
          message: ok
            ? `SKU ${line.sku} on ${line.deliveryNoteNumber}: ${shelf.remainingPct.toFixed(1)}% shelf life remaining (>= ${minPct}%).`
            : `SKU ${line.sku} on ${line.deliveryNoteNumber}: only ${shelf.remainingPct.toFixed(1)}% shelf life remaining (< ${minPct}%). Exception required.`,
          details: {
            sku: line.sku,
            remainingPct: Number(shelf.remainingPct.toFixed(1)),
            requiredPct: minPct,
            totalDays: shelf.totalDays,
            remainingDays: shelf.remainingDays,
          },
        }),
      );
    }
    return results;
  },
};
