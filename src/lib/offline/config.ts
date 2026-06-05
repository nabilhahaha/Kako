// ============================================================================
// Offline config assembler (Phase P0)
// ----------------------------------------------------------------------------
// Composes the resolved offline runtime (paths, ports, gateway URL) with the
// active edition descriptor into one object the offline scripts and the local
// stack supervisor consume. Server/script-side only (pulls in node modules via
// runtime.ts); never imported by browser code.
//
// The browser/app still reaches Supabase/PostgREST through the existing
// `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` seam — offline
// packaging sets those to the local gateway, so no cloud code path changes.
// ============================================================================

import { currentEdition, type Edition } from '@/lib/edition/editions';
import { isOffline, offlinePaths, offlinePorts, offlineGatewayUrl, offlineOS, type OfflinePaths, type OfflinePorts, type OfflineOS } from './runtime';

export interface OfflineConfig {
  enabled: boolean;
  os: OfflineOS;
  edition: Edition;
  paths: OfflinePaths;
  ports: OfflinePorts;
  /** Base URL supabase-js targets locally. */
  gatewayUrl: string;
  /** Local PostgreSQL connection (the privileged owner role; service-side only). */
  pg: {
    host: string;
    port: number;
    database: string;
    user: string;
  };
}

/** Build the offline configuration from env + the active edition. */
export function offlineConfig(env: NodeJS.ProcessEnv = process.env): OfflineConfig {
  const ports = offlinePorts(env);
  return {
    enabled: isOffline(),
    os: offlineOS(),
    edition: currentEdition(),
    paths: offlinePaths('Kako', process.platform, env),
    ports,
    gatewayUrl: offlineGatewayUrl(env),
    pg: {
      host: '127.0.0.1',
      port: ports.pg,
      // Default to `postgres` for parity with the CI/migration bootstrap, which
      // pins `search_path` on the `postgres` database (supabase/ci/bootstrap.sql).
      database: env.KAKO_OFFLINE_PG_DB || 'postgres',
      user: env.KAKO_OFFLINE_PG_USER || 'postgres',
    },
  };
}
