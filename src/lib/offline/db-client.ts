// ============================================================================
// Offline local DB client (Phase P3+)
// ----------------------------------------------------------------------------
// A privileged node-postgres connection to the LOCAL cluster, used by the
// offline server for paths that need elevated access (auth credential check,
// backup/restore). This is the offline analogue of the cloud service-role
// client. Offline/server-side only and lazily imported so `pg` never lands in
// the cloud client bundle.
// ============================================================================

import { offlineConfig } from './config';
import type { Queryable } from './auth';

// Minimal shapes so we don't hard-import pg's types at module load.
interface PgClientLike extends Queryable { end(): Promise<void>; }

/** Open a one-shot privileged connection to the local offline Postgres. Caller
 *  must `end()` it. Throws if not running offline (guards accidental cloud use). */
export async function connectLocal(env: NodeJS.ProcessEnv = process.env): Promise<PgClientLike> {
  const cfg = offlineConfig(env);
  if (!cfg.enabled) throw new Error('connectLocal() called outside offline mode (KAKO_OFFLINE not set)');
  const { Client } = await import('pg');
  const client = new Client({
    host: cfg.pg.host,
    port: cfg.pg.port,
    user: cfg.pg.user,
    database: cfg.pg.database,
  });
  await client.connect();
  return client as unknown as PgClientLike;
}
