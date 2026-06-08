// ============================================================================
// Route Accounting — van statement assembly (Phase 7A). Pure. Ties the day's
// pieces (opening balance, load, sales, collections, returns, expenses) into the
// cash + inventory reconciliations and the route P&L, producing the Van Statement
// / Day-Close / Cash-Recon / Inventory-Recon / Route-Profitability payloads. The
// renderers (PDF/Excel/page) wrap this. No I/O.
// ============================================================================

import { reconcileCash, type CashReconInput, type CashReconResult } from './cash';
import { reconcileVanInventory, type VanInventoryLine, type VanInventoryReconResult } from './inventory';
import { routeProfitability, type RouteProfitInput, type RouteProfitResult } from './profitability';

export interface VanStatementMeta {
  companyId: string;
  warehouseId: string;     // the van
  salesmanId: string;
  settlementDate: string;  // ISO date
  routeId?: string | null;
}

export interface VanStatementInput {
  meta: VanStatementMeta;
  openingCash: number;
  openingStockValue: number;
  cash: CashReconInput;
  inventory: VanInventoryLine[];
  profit: RouteProfitInput;
}

export interface VanStatement {
  meta: VanStatementMeta;
  openingCash: number;
  openingStockValue: number;
  cashReconciliation: CashReconResult;
  inventoryReconciliation: VanInventoryReconResult;
  routeProfitability: RouteProfitResult;
  dayClose: {
    cashStatus: CashReconResult['status'];
    cashVariance: number;
    inventoryVarianceValue: number;
    netProfit: number;
  };
}

/**
 * Build the full van statement. The route P&L automatically absorbs the valued
 * inventory shortage from reconciliation unless one is supplied. Pure.
 */
export function buildVanStatement(input: VanStatementInput): VanStatement {
  const cashReconciliation = reconcileCash(input.cash);
  const inventoryReconciliation = reconcileVanInventory(input.inventory);
  const routeProfit = routeProfitability({
    ...input.profit,
    inventoryShortage: input.profit.inventoryShortage ?? inventoryReconciliation.shortageValue,
  });
  return {
    meta: input.meta,
    openingCash: input.openingCash,
    openingStockValue: input.openingStockValue,
    cashReconciliation,
    inventoryReconciliation,
    routeProfitability: routeProfit,
    dayClose: {
      cashStatus: cashReconciliation.status,
      cashVariance: cashReconciliation.variance,
      inventoryVarianceValue: inventoryReconciliation.totalVarianceValue,
      netProfit: routeProfit.netProfit,
    },
  };
}
