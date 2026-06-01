'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { syncVisitsWith, type VisitAction, type VisitStartAction, type VisitEndAction, type SyncItemResult } from '@/lib/erp/field-sync';

/** ── Field Execution — visit sync actions (FE-2b) ───────────────────────────
 *  The bridge the offline outbox (FE-2c) and the rep UI (FE-2d) call. All three
 *  funnel through the same idempotent RPCs, so an online single action and an
 *  offline replayed batch behave identically (duplicate-safe via client_ref). */

async function guarded(): Promise<boolean> {
  const ctx = await getUserContext();
  return !!ctx?.company?.id && ctx.modules.includes('field_ops');
}

/** Sync a batch of queued visit actions. Never throws; returns one result per
 *  item (ok / idempotent / error+code) so the client can reconcile its outbox.
 *  Partial failures are isolated — successful items still commit. */
export async function syncOutbox(items: VisitAction[]): Promise<{ ok: boolean; results: SyncItemResult[]; error?: string }> {
  if (!(await guarded())) return { ok: false, results: [], error: 'unauthorized' };
  if (!Array.isArray(items) || items.length === 0) return { ok: true, results: [] };
  const supabase = await createClient();
  const results = await syncVisitsWith(supabase, items);
  revalidatePath('/field/visits');
  return { ok: true, results };
}

/** Single check-in (online path). Same idempotent RPC as the batch. */
export async function startVisit(input: Omit<VisitStartAction, 'kind'>): Promise<SyncItemResult> {
  if (!(await guarded())) return { clientRef: input.clientRef, kind: 'start', ok: false, code: 'no_company', error: 'unauthorized' };
  const supabase = await createClient();
  const [r] = await syncVisitsWith(supabase, [{ kind: 'start', ...input }]);
  revalidatePath('/field/visits');
  return r;
}

/** Single check-out (online path). */
export async function endVisit(input: Omit<VisitEndAction, 'kind'>): Promise<SyncItemResult> {
  if (!(await guarded())) return { clientRef: input.clientRef, kind: 'end', ok: false, code: 'no_company', error: 'unauthorized' };
  const supabase = await createClient();
  const [r] = await syncVisitsWith(supabase, [{ kind: 'end', ...input }]);
  revalidatePath('/field/visits');
  return r;
}
