// ============================================================================
// Phase 0 — Event-producer backbone. Domain mutations call emitDomainEvent(...)
// AFTER they succeed; it is the single, flag-gated seam that publishes domain
// events onto the shared bus (erp_events) for the Workflow runtime, Finance
// posting, Search incremental indexing, and Trade Spend triggers.
//
// Gated by KAKO_EVENTS (default OFF): when off this is a no-op, so wiring
// producers changes nothing until the backbone is enabled. Best-effort — never
// throws (recordEvent swallows); event production must not affect business logic.
// Reuses the existing emit/dispatch (src/lib/workflow/emit). One bus, one emitter.
// ============================================================================

import { recordEvent, type RecordEventInput } from '@/lib/workflow/emit';
import { EVENT, type EventType } from '@/lib/workflow/event-types';
import { projectOnEvent } from '@/lib/search/live';

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Phase 0 event-producer backbone flag (default OFF). */
export const EVENTS_ENABLED = (): boolean => on(process.env.KAKO_EVENTS);

/** Re-export the single-sourced event catalog so producers use typed constants. */
export { EVENT, type EventType };

export interface DomainEventInput extends Omit<RecordEventInput, 'eventType'> {
  eventType: EventType;     // catalog-typed (greppable, single-sourced)
}

/** Emit a domain event after a successful mutation. No-op unless KAKO_EVENTS is on;
 *  never throws (producers stay non-fatal). */
export async function emitDomainEvent(input: DomainEventInput): Promise<void> {
  if (!EVENTS_ENABLED()) return;
  try {
    await recordEvent(input);                              // Workflow runtime + bus
  } catch {
    // recordEvent already swallows; this is a belt-and-braces guard.
  }
  // Search-live incremental indexing (independently gated by KAKO_SEARCH_LIVE).
  await projectOnEvent(input.entity, input.recordId ?? null);
}
