/**
 * RULE 1 — Every Delivery Note must belong to an existing PI.
 */
import { finding, type ValidationRule } from '../types';

export const dnBelongsToPiRule: ValidationRule = {
  code: 'DN_BELONGS_TO_PI',
  name: 'Delivery Note linked to PI',
  description: 'Every Delivery Note must reference an existing Proforma Invoice.',
  requiresExceptionOnFail: false,
  run(ctx) {
    const piNumbers = new Set(ctx.pis.map((p) => p.piNumber));
    return ctx.deliveryNotes.map((dn) => {
      const exists = dn.piId != null || piNumbers.has(dn.piNumber);
      return finding({
        ruleCode: this.code,
        ruleName: this.name,
        severity: exists ? 'pass' : 'fail',
        scope: 'delivery_note',
        piId: dn.piId,
        piNumber: dn.piNumber,
        deliveryNoteNumber: dn.deliveryNoteNumber,
        message: exists
          ? `Delivery Note ${dn.deliveryNoteNumber} is linked to PI ${dn.piNumber}.`
          : `Delivery Note ${dn.deliveryNoteNumber} references PI ${dn.piNumber || '(none)'} which does not exist.`,
        details: { piNumber: dn.piNumber, deliveryNote: dn.deliveryNoteNumber },
      });
    });
  },
};
