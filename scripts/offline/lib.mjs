// ============================================================================
// Offline scripts — shared helpers (Phase P0)
// ----------------------------------------------------------------------------
// Plain Node ESM (runs with `node`, no ts-runner needed) used by db / migrate /
// seed / bootstrap / verify. Path & port resolution mirrors
// src/lib/offline/runtime.ts; runtime.test.ts locks the TS behavior and the
// verify harness exercises this end-to-end, so drift is caught.
// ============================================================================

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SUPA_DIR = path.join(REPO_ROOT, 'supabase');

export function offlineOS(platform = process.platform) {
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

export function offlineHome(dirName = 'Kako', env = process.env) {
  if (env.KAKO_OFFLINE_HOME) return path.resolve(env.KAKO_OFFLINE_HOME);
  const home = os.homedir();
  switch (offlineOS()) {
    case 'macos': return path.join(home, 'Library', 'Application Support', dirName);
    case 'windows': return path.join(env.PROGRAMDATA || env.LOCALAPPDATA || home, dirName);
    default: return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), dirName);
  }
}

export function offlinePaths(dirName = 'Kako', env = process.env) {
  const root = offlineHome(dirName, env);
  return {
    root,
    dataDir: path.join(root, 'db'),
    backupsDir: path.join(root, 'backups'),
    runDir: path.join(root, 'run'),
    logFile: path.join(root, 'run', 'postgres.log'),
    licenseFile: path.join(root, 'license.json'),
    secretsFile: path.join(root, 'secrets.json'),
  };
}

export function offlinePorts(env = process.env) {
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
  return {
    pg: num(env.KAKO_OFFLINE_PG_PORT, 54329),
    postgrest: num(env.KAKO_OFFLINE_PGRST_PORT, 54330),
    app: num(env.KAKO_OFFLINE_APP_PORT, 54331),
  };
}

export function pgConn(env = process.env) {
  return {
    db: env.KAKO_OFFLINE_PG_DB || 'postgres',
    user: env.KAKO_OFFLINE_PG_USER || 'postgres',
    port: offlinePorts(env).pg,
    host: '127.0.0.1',
  };
}

// ── Edition (mirrors src/lib/edition/editions.ts businessType mapping) ──────
const EDITION_BUSINESS_TYPE = {
  retail: 'clothing', pharmacy: 'pharmacy', restaurant: 'restaurant', fmcg: 'general',
};
export function editionId(env = process.env) {
  const id = env.KAKO_EDITION;
  return EDITION_BUSINESS_TYPE[id] ? id : 'retail';
}
export function editionBusinessType(env = process.env) {
  return EDITION_BUSINESS_TYPE[editionId(env)];
}

// ── PostgreSQL binary discovery ─────────────────────────────────────────────
// Offline builds bundle their own PG17 (KAKO_PG_BIN). For local/CI runs, fall
// back to a discoverable system install.
export function pgBin(env = process.env) {
  if (env.KAKO_PG_BIN && fs.existsSync(env.KAKO_PG_BIN)) return env.KAKO_PG_BIN;
  // Common Linux apt layout: /usr/lib/postgresql/<ver>/bin
  const aptRoot = '/usr/lib/postgresql';
  if (fs.existsSync(aptRoot)) {
    const vers = fs.readdirSync(aptRoot).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
    for (const v of vers) {
      const bin = path.join(aptRoot, v, 'bin');
      if (fs.existsSync(path.join(bin, 'initdb'))) return bin;
    }
  }
  // PATH fallback (macOS Homebrew, Windows bundle dir on PATH).
  return '';
}

export function pgTool(name, env = process.env) {
  const bin = pgBin(env);
  return bin ? path.join(bin, name) : name;
}

// PostgreSQL refuses to run as root. When invoked as root (e.g. a CI container),
// KAKO_PG_RUNAS de-escalates the pg tooling to a normal account via `runuser`.
// In production the app runs as a normal user and this is a no-op.
export function pgPrivPrefix(env = process.env) {
  const user = env.KAKO_PG_RUNAS;
  if (user && typeof process.getuid === 'function' && process.getuid() === 0) {
    return ['runuser', '-u', user, '--'];
  }
  return [];
}

// ── Process helpers ─────────────────────────────────────────────────────────
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) {
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
    throw new Error(`command failed (${r.status}): ${cmd} ${args.join(' ')}\n${out}`);
  }
  return (r.stdout || '').trim();
}

export function tryRun(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), status: r.status };
}

/** Run a pg binary, applying the privilege-drop prefix when needed. */
export function runPg(name, args, env = process.env, opts = {}) {
  const argv = [...pgPrivPrefix(env), pgTool(name, env), ...args];
  return run(argv[0], argv.slice(1), { env, ...opts });
}

export function tryRunPg(name, args, env = process.env, opts = {}) {
  const argv = [...pgPrivPrefix(env), pgTool(name, env), ...args];
  return tryRun(argv[0], argv.slice(1), { env, ...opts });
}

function psqlArgs(c, extra) {
  return ['-h', c.host, '-p', String(c.port), '-U', c.user, '-d', c.db, '-v', 'ON_ERROR_STOP=1', ...extra];
}

export function psql(sql, env = process.env, extraArgs = []) {
  return runPg('psql', psqlArgs(pgConn(env), ['-q', ...extraArgs, '-c', sql]), env);
}

/** Apply an .sql file. The file is read by this (root-capable) process and fed
 *  to psql via stdin, so the de-escalated pg user needs no access to the repo. */
export function psqlFile(file, env = process.env) {
  const sql = fs.readFileSync(file, 'utf8');
  return runPg('psql', psqlArgs(pgConn(env), ['-q', '-f', '-']), env, { input: sql });
}

export function psqlScalar(sql, env = process.env) {
  return runPg('psql', psqlArgs(pgConn(env), ['-tA', '-c', sql]), env).trim();
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

export function log(msg) { process.stdout.write(`› ${msg}\n`); }

export { spawn, fs, path };
