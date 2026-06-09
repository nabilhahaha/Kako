// ============================================================================
// Van Sales — offline load confirmation (Phase B). Browser helper that queues a
// load confirmation into the offline-sync IndexedDB queue, applied EXACTLY-ONCE
// server-side on the next sync via the SAME confirmLoad → erp_van_confirm_load
// path (no forked logic; stock posts server-side only). Kept out of the index
// barrel so the IndexedDB client never enters server bundles.
// ============================================================================

import { enqueue } from '@/lib/offline-sync/client';
import type { ConfirmationLineInput } from './load';

/** Queue a van load confirmation for offline-first submission. Returns the
 *  idempotency key (empty when IndexedDB is unavailable). */
export async function enqueueLoadConfirmation(input: {
  manifestId: string;
  lines: ConfirmationLineInput[];
  notes?: string;
}): Promise<string> {
  return enqueue('van_load_confirmation', 'create', {
    manifestId: input.manifestId,
    lines: input.lines,
    notes: input.notes,
  });
}
