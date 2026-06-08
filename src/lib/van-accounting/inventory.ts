// ============================================================================
// Route Accounting — van inventory reconciliation (Phase 7A). Pure. Per-SKU:
// expected = opening + loaded + transfers-in − transfers-out − sold + returns-in;
// variance = counted − expected, valued at unit cost (shortage/overage). Mirrors
// the existing erp_van_reconciliations (0138) compute as a pure, testable engine
// for the van statement. No I/O.
// ============================================================================

export interface VanInventoryLine {
  productId: string;
  openingQty: number;
  loadedQty: number;
  transferInQty?: number;
  transferOutQty?: number;
  soldQty: number;
  returnedInQty?: number;   // customer returns received back onto the van
  countedQty: number;
  unitCost: number;
}

export interface VanInventoryReconLine {
  productId: string;
  expectedQty: number;
  countedQty: number;
  varianceQty: number;      // counted − expected (negative = short)
  varianceValue: number;
}

const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Reconcile one SKU on the van. Pure. */
export function reconcileVanLine(l: VanInventoryLine): VanInventoryReconLine {
  const expectedQty = round3(
    l.openingQty + l.loadedQty + (l.transferInQty ?? 0) - (l.transferOutQty ?? 0) - l.soldQty + (l.returnedInQty ?? 0),
  );
  const varianceQty = round3(l.countedQty - expectedQty);
  return { productId: l.productId, expectedQty, countedQty: round3(l.countedQty), varianceQty, varianceValue: round2(varianceQty * l.unitCost) };
}

export interface VanInventoryReconResult {
  lines: VanInventoryReconLine[];
  totalVarianceValue: number;
  shortageValue: number;
  overageValue: number;
}

/** Reconcile the whole van's inventory. Pure. */
export function reconcileVanInventory(lines: readonly VanInventoryLine[]): VanInventoryReconResult {
  const out = lines.map(reconcileVanLine);
  return {
    lines: out,
    totalVarianceValue: round2(out.reduce((s, l) => s + l.varianceValue, 0)),
    shortageValue: round2(out.filter((l) => l.varianceValue < 0).reduce((s, l) => s - l.varianceValue, 0)),
    overageValue: round2(out.filter((l) => l.varianceValue > 0).reduce((s, l) => s + l.varianceValue, 0)),
  };
}
