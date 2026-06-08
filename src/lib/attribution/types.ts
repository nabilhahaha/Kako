// ============================================================================
// Commercial Attribution & Traceability — types (Phase 4+). The raw attribution
// record links any commercial document (invoice / invoice line / return /
// promotion) to its promotion, funding shares, incentive, and commission — plus
// the owner dimensions — so the platform can EXPLAIN every transaction and expose
// fully traceable raw data. Maps onto erp_commercial_attribution.
// ============================================================================

export type AttributionRefType = 'invoice' | 'invoice_line' | 'return' | 'promotion';

export interface AttributionRecord {
  id?: string;
  companyId: string;
  refType: AttributionRefType;
  refId: string;
  // promotion / funding
  promotionId?: string | null;
  promotionName?: string | null;
  promotionType?: string | null;
  fundingSource?: string | null;        // supplier|company|distributor|shared
  supplierShare?: number | null;
  companyShare?: number | null;
  distributorShare?: number | null;
  discountAmount?: number | null;
  freeGoodsQty?: number | null;
  // incentive / commission
  incentiveProgramId?: string | null;
  incentiveAmount?: number | null;
  commissionRuleId?: string | null;
  commissionAmount?: number | null;
  // financials
  grossSales?: number | null;
  netSales?: number | null;
  returnImpactValue?: number | null;
  roiImpact?: number | null;
  // dimensions
  customerId?: string | null;
  salesmanId?: string | null;
  supervisorId?: string | null;
  routeId?: string | null;
  channel?: string | null;
  regionId?: string | null;
  period?: string | null;               // 'YYYY-MM'
  eventDate?: string | null;            // ISO
}
