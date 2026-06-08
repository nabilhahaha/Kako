// ============================================================================
// Returns — validation (Phase 4+). Pure. Consistency checks + warnings: customer
// purchased the SKU before, returned qty ≤ sold qty, promotion/discount/funding
// consistency. Returns blocking errors + non-blocking warnings.
// ============================================================================

export interface ReturnValidationItem { field: string; message: string; level: 'error' | 'warning' }

export interface ReturnValidationLine {
  productId: string;
  returnedQty: number;
  soldQtyHistorical: number;      // total ever sold to this customer (0 = never)
  soldQtyOnInvoice?: number | null; // qty on the referenced invoice line (when from_invoice)
  promotionId?: string | null;
  invoiceHadPromotion?: boolean;
}

/** Validate return lines; errors block, warnings advise. Pure. */
export function validateReturn(
  lines: readonly ReturnValidationLine[],
  opts: { requireOriginalInvoice?: boolean } = {},
): ReturnValidationItem[] {
  const issues: ReturnValidationItem[] = [];
  lines.forEach((l, i) => {
    if (l.returnedQty <= 0) issues.push({ field: `lines[${i}].returnedQty`, message: 'returned quantity must be positive', level: 'error' });
    if (opts.requireOriginalInvoice && (l.soldQtyOnInvoice == null)) {
      issues.push({ field: `lines[${i}]`, message: 'original invoice line is required', level: 'error' });
    }
    if (l.soldQtyOnInvoice != null && l.returnedQty > l.soldQtyOnInvoice) {
      issues.push({ field: `lines[${i}].returnedQty`, message: 'return exceeds original invoice quantity', level: 'error' });
    }
    if (l.soldQtyHistorical <= 0) {
      issues.push({ field: `lines[${i}].productId`, message: 'customer never purchased this SKU', level: 'warning' });
    } else if (l.returnedQty > l.soldQtyHistorical) {
      issues.push({ field: `lines[${i}].returnedQty`, message: 'return exceeds historical purchase quantity', level: 'warning' });
    }
    if (l.promotionId && l.invoiceHadPromotion === false) {
      issues.push({ field: `lines[${i}].promotionId`, message: 'promotion mismatch: original sale had no promotion', level: 'warning' });
    }
  });
  return issues;
}

/** True when there are no blocking errors. Pure. */
export function isReturnValid(issues: readonly ReturnValidationItem[]): boolean {
  return !issues.some((i) => i.level === 'error');
}
