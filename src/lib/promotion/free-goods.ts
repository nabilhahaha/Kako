// ============================================================================
// Promotion Platform — free-goods engine (Phase 4+). Pure. Buy-X-get-Y / 10+1 /
// 10+2 / tiered free goods, and the proportional FREE-QUANTITY REVERSAL used by
// the returns engine (return N sold → reverse the matching free units). No
// hardcoded ratios — the deal is data.
// ============================================================================

export interface FreeGoodsDeal {
  buyQty: number;    // X
  freeQty: number;   // Y
}

/** Free units earned for `soldQty` under a buy-X-get-Y deal. Pure. */
export function freeGoodsFor(soldQty: number, deal: FreeGoodsDeal): number {
  if (deal.buyQty <= 0 || deal.freeQty <= 0 || soldQty <= 0) return 0;
  return Math.floor(soldQty / deal.buyQty) * deal.freeQty;
}

export interface FreeGoodsTier { minQty: number; freeQty: number }

/** Free units under tiered free-goods (highest qualifying tier). Pure. */
export function tieredFreeGoods(soldQty: number, tiers: readonly FreeGoodsTier[]): number {
  return [...tiers]
    .filter((t) => soldQty >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0]?.freeQty ?? 0;
}

/**
 * Proportional free-goods reversal for a return: given the original sold + free
 * quantities and the returned sold quantity, how many free units must come back.
 * Rounded to nearest whole unit (commercial reality). Pure.
 */
export function freeGoodsReversal(originalSold: number, originalFree: number, returnedSold: number): number {
  if (originalSold <= 0 || originalFree <= 0 || returnedSold <= 0) return 0;
  return Math.round((returnedSold / originalSold) * originalFree);
}
