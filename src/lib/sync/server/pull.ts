// ============================================================================
// Server-side /api/sync pull — cursor-based change feed (pure over a DB seam).
//
// Cursor is a monotonic sequence (the proposed sync seq / updated_at high-water
// mark). Pure so it is unit-testable without a database; the route wires
// `getChanges` to Supabase. Behind KAKO_SYNC.
// ============================================================================

import type { RemoteRecord } from '../types';

export interface PullDeps {
  /** Rows for `entity` strictly after `sinceSeq`, ascending, capped at `limit`.
   *  Returns the highest seq observed so the cursor only advances over applied
   *  rows (no skips on partial reads). */
  getChanges(entity: string, sinceSeq: number, limit: number): Promise<{ rows: RemoteRecord[]; maxSeq: number }>;
}

export interface PullResult { changes: RemoteRecord[]; cursor: string }

export async function pullChanges(
  entity: string,
  cursor: string | null,
  deps: PullDeps,
  limit = 200,
): Promise<PullResult> {
  const since = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const { rows, maxSeq } = await deps.getChanges(entity, since, limit);
  // Advance only if we actually saw newer rows; otherwise hold the cursor.
  const nextSeq = rows.length > 0 ? Math.max(since, maxSeq) : since;
  return { changes: rows, cursor: String(nextSeq) };
}
