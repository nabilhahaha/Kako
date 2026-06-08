// ============================================================================
// Form Builder — offline submission (Phase 8F-2). Browser helper that queues a
// form response into the offline-sync IndexedDB queue, to be applied EXACTLY-ONCE
// server-side on the next sync via the SAME submitFormResponse path (no forked
// business logic). Kept out of the index barrel so the IndexedDB client never
// enters server bundles. Mirrors the survey offline pattern.
// ============================================================================

import { enqueue } from '@/lib/offline-sync/client';
import type { SubmitFormInput } from './submit-types';

/** Queue a form response for offline-first submission. Returns the idempotency
 *  key (empty string when IndexedDB is unavailable). The server applies it via
 *  the `form_response` whitelist handler on sync. */
export async function enqueueFormResponse(input: SubmitFormInput): Promise<string> {
  return enqueue('form_response', 'create', {
    formId: input.formId,
    formCode: input.formCode,
    answers: input.answers,
    entity: input.entity,
    recordId: input.recordId,
  });
}
