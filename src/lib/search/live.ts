// ============================================================================
// Search OS — live (event-driven) incremental indexing (P2). On a domain event,
// re-project that one entity into the unified index so search stays fresh without
// a full backfill. Gated by KAKO_SEARCH_LIVE (default OFF); the pg_cron reindex
// remains the backstop/reconcile. Reuses the provider registry + projectOne.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { SEARCH_LIVE } from './flags';
import { projectOne } from './backfill';
import type { SearchEntityType } from './types';

/** Event catalog entity key → search entity type (only indexed entities). */
const EVENT_ENTITY_TO_SEARCH: Record<string, SearchEntityType> = {
  customer: 'customer', product: 'product', supplier: 'supplier',
  order: 'order', invoice: 'invoice', return: 'return', visit: 'visit', workflow: 'workflow',
};

/** Re-index a single entity in response to a domain event. No-op unless
 *  KAKO_SEARCH_LIVE is on; best-effort (never throws). */
export async function projectOnEvent(entity: string, recordId: string | null | undefined): Promise<void> {
  if (!SEARCH_LIVE() || !recordId) return;
  const type = EVENT_ENTITY_TO_SEARCH[entity];
  if (!type) return;                       // e.g. payment / stock_transfer → not a search entity
  try {
    const db = await createClient();
    await projectOne(db, type, recordId);
  } catch {
    // best-effort; the reconcile reindex (cron) is the backstop.
  }
}
