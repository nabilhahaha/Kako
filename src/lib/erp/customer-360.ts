import type { SupabaseClient } from '@supabase/supabase-js';

/** ── Customer 360 (Platform Foundation #5) ────────────────────────────────
 *  Platform-level, read-only profile composed from all foundations (master,
 *  ownership, workflow, audit, attachments, raw-data analytics) via the
 *  erp_customer_360 SQL function — tenant-isolated and permission-aware. Future
 *  modules ENRICH it (by writing raw facts / their data); the shape is stable. */

export interface Customer360 {
  master: {
    id: string; code: string; name: string; name_en: string; phone: string | null;
    credit_limit: number; status: 'active' | 'pending';
    classification: string | null; route: string | null; branch: string | null;
    region: string | null; area: string | null;
  };
  ownership: {
    account_owner: { id: string; name: string | null; email: string | null } | null;
    route_owner: { id: string; name: string | null; email: string | null } | null;
    supervisor: { id: string; name: string | null } | null;
    manager: { id: string; name: string | null } | null;
  };
  workflow: { open_requests: number; pending_approvals: number; recent_activities: { event: string; at: string }[] };
  audit: {
    recent_changes: { action: string; changed: string[] | null; by: string | null; at: string }[];
    last_modified_by: string | null; last_modified_at: string | null;
  };
  attachments: { total: number; images: number; documents: number; certifications: number; items: unknown[] };
  analytics: { module: string; events: number; amount: number | null; currency: string | null; quantity: number | null; gross_profit: number | null }[];
}

/** Fetch the composed 360 profile for a customer (null if not found/forbidden). */
export async function getCustomer360(supabase: SupabaseClient, customerId: string): Promise<Customer360 | null> {
  const { data, error } = await supabase.rpc('erp_customer_360', { p_customer: customerId });
  if (error || !data) return null;
  return data as Customer360;
}
