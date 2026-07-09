/**
 * MODULE 5 — Invoice Validation. Validates the relationship between Delivery
 * Notes and Invoices. Each concern is an independent rule so they can be
 * enabled, extended, or reasoned about in isolation.
 */
import { finding, type ValidationRule } from '../types';

/** Duplicate Invoice — the same invoice number appears more than once. */
export const duplicateInvoiceRule: ValidationRule = {
  code: 'INVOICE_DUPLICATE',
  name: 'Duplicate invoice',
  description: 'An invoice number must appear only once.',
  requiresExceptionOnFail: true,
  run(ctx) {
    const counts = new Map<string, number>();
    for (const inv of ctx.invoices) {
      counts.set(inv.invoiceNumber, (counts.get(inv.invoiceNumber) ?? 0) + 1);
    }
    const reported = new Set<string>();
    const results = [];
    for (const inv of ctx.invoices) {
      const count = counts.get(inv.invoiceNumber) ?? 0;
      if (count <= 1 || reported.has(inv.invoiceNumber)) continue;
      reported.add(inv.invoiceNumber);
      results.push(
        finding({
          ruleCode: this.code,
          ruleName: this.name,
          severity: 'fail',
          scope: 'invoice',
          piId: inv.piId,
          piNumber: inv.piNumber,
          invoiceNumber: inv.invoiceNumber,
          message: `Invoice ${inv.invoiceNumber} appears ${count} times (duplicate).`,
          details: { invoiceNumber: inv.invoiceNumber, occurrences: count },
        }),
      );
    }
    return results;
  },
};

/** Delivery without Invoice — a Delivery Note that has not been invoiced. */
export const deliveryWithoutInvoiceRule: ValidationRule = {
  code: 'DELIVERY_WITHOUT_INVOICE',
  name: 'Delivery without invoice',
  description: 'Every Delivery Note should have a corresponding invoice.',
  requiresExceptionOnFail: false,
  run(ctx) {
    const invoicedDnNumbers = new Set(
      ctx.invoices.map((i) => i.deliveryNoteNumber).filter(Boolean) as string[],
    );
    const invoicedPiNumbers = new Set(ctx.invoices.map((i) => i.piNumber));

    return ctx.deliveryNotes.map((dn) => {
      const covered =
        invoicedDnNumbers.has(dn.deliveryNoteNumber) || invoicedPiNumbers.has(dn.piNumber);
      return finding({
        ruleCode: this.code,
        ruleName: this.name,
        severity: covered ? 'pass' : 'warning',
        scope: 'delivery_note',
        piId: dn.piId,
        piNumber: dn.piNumber,
        deliveryNoteNumber: dn.deliveryNoteNumber,
        message: covered
          ? `Delivery Note ${dn.deliveryNoteNumber} has an associated invoice.`
          : `Delivery Note ${dn.deliveryNoteNumber} has no associated invoice.`,
        details: { deliveryNote: dn.deliveryNoteNumber, piNumber: dn.piNumber },
      });
    });
  },
};

/** Invoice without Delivery — an invoice with no backing Delivery Note. */
export const invoiceWithoutDeliveryRule: ValidationRule = {
  code: 'INVOICE_WITHOUT_DELIVERY',
  name: 'Invoice without delivery',
  description: 'Every invoice must be backed by a Delivery Note.',
  requiresExceptionOnFail: true,
  run(ctx) {
    const dnNumbers = new Set(ctx.deliveryNotes.map((d) => d.deliveryNoteNumber));
    const piWithDeliveries = new Set(
      ctx.deliveryNotes.map((d) => d.piNumber),
    );

    return ctx.invoices.map((inv) => {
      let covered: boolean;
      if (inv.deliveryNoteNumber) {
        covered = dnNumbers.has(inv.deliveryNoteNumber);
      } else {
        covered = piWithDeliveries.has(inv.piNumber);
      }
      return finding({
        ruleCode: this.code,
        ruleName: this.name,
        severity: covered ? 'pass' : 'fail',
        scope: 'invoice',
        piId: inv.piId,
        piNumber: inv.piNumber,
        deliveryNoteNumber: inv.deliveryNoteNumber,
        invoiceNumber: inv.invoiceNumber,
        message: covered
          ? `Invoice ${inv.invoiceNumber} is backed by a Delivery Note.`
          : `Invoice ${inv.invoiceNumber} has no matching Delivery Note${inv.deliveryNoteNumber ? ` (${inv.deliveryNoteNumber})` : ` for PI ${inv.piNumber}`}.`,
        details: {
          invoiceNumber: inv.invoiceNumber,
          deliveryNote: inv.deliveryNoteNumber,
          piNumber: inv.piNumber,
        },
      });
    });
  },
};

/** Quantity mismatch — invoiced quantity per SKU differs from delivered. */
export const invoiceQuantityMismatchRule: ValidationRule = {
  code: 'INVOICE_QTY_MISMATCH',
  name: 'Invoice quantity matches delivery',
  description: 'Invoiced quantity per SKU should match delivered quantity.',
  requiresExceptionOnFail: false,
  run(ctx) {
    const tolerance = ctx.config.invoiceQuantityTolerance;
    const invoicePiId = new Map(ctx.invoices.map((i) => [i.id, i.piId] as const));

    // delivered & invoiced keyed by "piNumber::sku"
    const delivered = new Map<string, number>();
    for (const l of ctx.deliveryNoteLines) {
      const k = `${l.piNumber}::${l.sku}`;
      delivered.set(k, (delivered.get(k) ?? 0) + (l.quantity || 0));
    }
    const invoiced = new Map<string, { qty: number; piId: string | null; piNumber: string }>();
    for (const l of ctx.invoiceLines) {
      const k = `${l.piNumber}::${l.sku}`;
      const cur = invoiced.get(k) ?? { qty: 0, piId: invoicePiId.get(l.invoiceId) ?? null, piNumber: l.piNumber };
      cur.qty += l.quantity || 0;
      invoiced.set(k, cur);
    }

    const results = [];
    for (const [key, inv] of invoiced) {
      const sku = key.split('::')[1];
      const deliveredQty = delivered.get(key) ?? 0;
      if (deliveredQty === 0 && inv.qty === 0) continue;
      const diff = inv.qty - deliveredQty;
      const ok = Math.abs(diff) <= tolerance;
      results.push(
        finding({
          ruleCode: this.code,
          ruleName: this.name,
          severity: ok ? 'pass' : 'warning',
          scope: 'sku',
          piId: inv.piId,
          piNumber: inv.piNumber,
          sku,
          message: ok
            ? `SKU ${sku}: invoiced ${inv.qty} matches delivered ${deliveredQty}.`
            : `SKU ${sku}: invoiced ${inv.qty} vs delivered ${deliveredQty} (difference ${diff > 0 ? '+' : ''}${diff}).`,
          details: { sku, invoiced: inv.qty, delivered: deliveredQty, difference: diff },
        }),
      );
    }
    return results;
  },
};

/** Missing Invoice — a fully delivered PI that has not been invoiced at all. */
export const missingInvoiceRule: ValidationRule = {
  code: 'MISSING_INVOICE',
  name: 'Missing invoice for delivered PI',
  description: 'A fully delivered PI must have at least one invoice.',
  requiresExceptionOnFail: false,
  run(ctx) {
    const invoicedPis = new Set(ctx.invoices.map((i) => i.piNumber));

    const deliveredByPiSku = new Map<string, number>();
    for (const l of ctx.deliveryNoteLines) {
      const k = `${l.piId}::${l.sku}`;
      deliveredByPiSku.set(k, (deliveredByPiSku.get(k) ?? 0) + (l.quantity || 0));
    }

    const linesByPi = new Map<string, typeof ctx.piLines>();
    for (const l of ctx.piLines) {
      const arr = linesByPi.get(l.piId) ?? [];
      arr.push(l);
      linesByPi.set(l.piId, arr);
    }

    const results = [];
    for (const pi of ctx.pis) {
      const lines = linesByPi.get(pi.id) ?? [];
      if (lines.length === 0) continue;
      const fullyDelivered = lines.every(
        (l) => (deliveredByPiSku.get(`${pi.id}::${l.sku}`) ?? 0) >= l.quantity,
      );
      const anyDelivered = lines.some(
        (l) => (deliveredByPiSku.get(`${pi.id}::${l.sku}`) ?? 0) > 0,
      );
      if (!fullyDelivered || !anyDelivered) continue;
      if (invoicedPis.has(pi.piNumber)) continue;
      results.push(
        finding({
          ruleCode: this.code,
          ruleName: this.name,
          severity: 'warning',
          scope: 'pi',
          piId: pi.id,
          piNumber: pi.piNumber,
          message: `PI ${pi.piNumber} is fully delivered but has no invoice.`,
          details: { piNumber: pi.piNumber },
        }),
      );
    }
    return results;
  },
};
