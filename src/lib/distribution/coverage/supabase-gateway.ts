// ============================================================================
// Distribution — Supabase implementation of the CoverageGateway. Reuses the
// existing erp_today_journey() RPC (plan) + erp_visits (actuals). Read-only,
// under the caller's RLS (branch-scoped). server-only.
// ============================================================================

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CoverageGateway } from './gateway';
import type { VisitFact } from './kpi';

type Db = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseCoverageGateway(db: Db): CoverageGateway {
  return {
    async loadPlannedCustomers(salesmanId, date) {
      const { data } = await db.rpc('erp_today_journey', { p_salesman: salesmanId, p_date: date });
      return ((data ?? []) as Array<{ customer_id: string }>).map((r) => r.customer_id);
    },

    async loadVisits(salesmanId, date) {
      const { data } = await db.from('erp_visits')
        .select('customer_id, invoice_id, no_sale, in_journey_plan, out_of_route')
        .eq('salesman_id', salesmanId).eq('visit_date', date);
      return ((data ?? []) as Array<Record<string, unknown>>).map((v): VisitFact => ({
        customerId: v.customer_id as string,
        productive: v.invoice_id != null && v.no_sale !== true,
        inPlan: v.in_journey_plan === true,
        outOfRoute: v.out_of_route === true,
      }));
    },
  };
}
