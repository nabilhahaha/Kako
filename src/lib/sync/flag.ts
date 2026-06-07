// ============================================================================
// KAKO_SYNC feature flag. Off by default everywhere — the sync subsystem is
// inert until a build/deploy explicitly opts in. Server reads KAKO_SYNC;
// the browser reads NEXT_PUBLIC_KAKO_SYNC (must be inlined at build time).
// ============================================================================

function truthy(v: string | undefined): boolean {
  return v === '1' || v === 'true';
}

/** Server/runtime flag (API routes, server actions). */
export function isSyncEnabledServer(env: Record<string, string | undefined> = process.env): boolean {
  return truthy(env.KAKO_SYNC);
}

/** Client/bundle flag (UI gating). NEXT_PUBLIC_* is inlined at build. */
export function isSyncEnabledClient(): boolean {
  return truthy(process.env.NEXT_PUBLIC_KAKO_SYNC);
}
