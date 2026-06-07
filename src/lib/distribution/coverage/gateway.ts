// ============================================================================
// Distribution — coverage read-model gateway (impure DB boundary). Keeps the
// coverage service unit-testable with a fake and the KPI engine pure. Supabase
// impl in supabase-gateway.ts (reuses erp_today_journey + erp_visits). Read-only.
// ============================================================================

import type { VisitFact } from './kpi';

export interface CoverageGateway {
  /** Customer ids on a salesman's journey plan for the date (today's plan). */
  loadPlannedCustomers(salesmanId: string, date: string): Promise<string[]>;
  /** The salesman's actual visits for the date, mapped to KPI facts. */
  loadVisits(salesmanId: string, date: string): Promise<VisitFact[]>;
}
