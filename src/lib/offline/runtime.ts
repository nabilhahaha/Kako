// ============================================================================
// Offline runtime — mode detection + per-OS path resolution (Phase P0)
// ----------------------------------------------------------------------------
// The OFFLINE edition runs the same Next.js app against a LOCAL stack
// (PostgreSQL 17 + PostgREST + local auth) bundled inside a Tauri shell. This
// module is the single seam the rest of the code asks "are we offline, and
// where do my local files live?".
//
// Everything offline is gated by KAKO_OFFLINE: when it is unset (the cloud
// build), `isOffline()` is false and none of the offline paths are used, so the
// cloud build/tests are completely unaffected.
//
// Pure and dependency-free (only `node:os`/`node:path`) so it is usable from
// the app, the offline scripts, and unit tests on every OS.
// ============================================================================

import os from 'node:os';
import path from 'node:path';

export type OfflineOS = 'macos' | 'windows' | 'linux';

/** A subset of the environment — anything map-like with string values. Keeps
 *  these helpers callable with partial env objects from tests. */
type EnvLike = Record<string, string | undefined>;

/** True when this process is running as the offline edition. */
export function isOffline(): boolean {
  const v = process.env.KAKO_OFFLINE;
  return v === '1' || v === 'true';
}

/** Normalized OS family for path/secret-store decisions. */
export function offlineOS(platform: NodeJS.Platform = process.platform): OfflineOS {
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

/** Per-OS root for the offline app's private data (DB cluster, backups, license,
 *  secrets). Overridable with KAKO_OFFLINE_HOME for tests / CI / portable mode.
 *
 *  - macOS:   ~/Library/Application Support/<dir>
 *  - Windows: %PROGRAMDATA%\<dir>  (falls back to LOCALAPPDATA, then home)
 *  - Linux:   $XDG_DATA_HOME/<dir> or ~/.local/share/<dir>  (dev/CI only)
 */
export function offlineHome(
  dirName = 'Kako',
  platform: NodeJS.Platform = process.platform,
  env: EnvLike = process.env,
): string {
  if (env.KAKO_OFFLINE_HOME) return path.resolve(env.KAKO_OFFLINE_HOME);
  const home = os.homedir();
  switch (offlineOS(platform)) {
    case 'macos':
      return path.join(home, 'Library', 'Application Support', dirName);
    case 'windows':
      return path.join(env.PROGRAMDATA || env.LOCALAPPDATA || home, dirName);
    default:
      return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), dirName);
  }
}

/** Resolved layout of the offline data directory. */
export interface OfflinePaths {
  root: string;
  /** PostgreSQL data directory (initdb target). */
  dataDir: string;
  /** Logical + physical backups land here. */
  backupsDir: string;
  /** Unix socket dir / runtime files. */
  runDir: string;
  /** Signed license file (P4). */
  licenseFile: string;
  /** Local secrets (JWT secret, PG password) — file fallback when no OS keystore. */
  secretsFile: string;
}

export function offlinePaths(
  dirName = 'Kako',
  platform: NodeJS.Platform = process.platform,
  env: EnvLike = process.env,
): OfflinePaths {
  const root = offlineHome(dirName, platform, env);
  return {
    root,
    dataDir: path.join(root, 'db'),
    backupsDir: path.join(root, 'backups'),
    runDir: path.join(root, 'run'),
    licenseFile: path.join(root, 'license.json'),
    secretsFile: path.join(root, 'secrets.json'),
  };
}

/** Local service ports. Defaults are picked to avoid the common Postgres 5432
 *  so an existing local Postgres does not clash; overridable via env. P0/P2 will
 *  add dynamic free-port selection on top of these defaults. */
export interface OfflinePorts {
  /** Local PostgreSQL. */
  pg: number;
  /** PostgREST (the /rest + /rpc gateway supabase-js talks to). */
  postgrest: number;
  /** Local Next.js Node server (hosts the app + the thin auth gateway). */
  app: number;
}

export function offlinePorts(env: EnvLike = process.env): OfflinePorts {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    pg: num(env.KAKO_OFFLINE_PG_PORT, 54329),
    postgrest: num(env.KAKO_OFFLINE_PGRST_PORT, 54330),
    app: num(env.KAKO_OFFLINE_APP_PORT, 54331),
  };
}

/** Base URL supabase-js should target when offline (the local gateway). */
export function offlineGatewayUrl(env: EnvLike = process.env): string {
  if (env.KAKO_OFFLINE_URL) return env.KAKO_OFFLINE_URL;
  return `http://127.0.0.1:${offlinePorts(env).app}`;
}
