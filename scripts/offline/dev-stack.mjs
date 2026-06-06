#!/usr/bin/env node
// ============================================================================
// Offline dev stack — run the full local app (the 3 processes the Tauri shell
// supervises) so you can use it in a browser before wrapping it in Tauri.
// ----------------------------------------------------------------------------
//   1. (you) start the DB once:  npm run offline:bootstrap
//   2. (you) build the app:      see docs / Step 7
//   3. node scripts/offline/dev-stack.mjs
//
// Starts PostgREST (the /rest gateway) + the standalone Next.js server, wired to
// the local Postgres + the shared JWT secret. Ctrl+C stops both cleanly.
// Requires KAKO_OFFLINE_JWT_SECRET (shared with the build's anon key).
// ============================================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlinePaths, offlinePorts, pgConn, ensureDir, log } from './lib.mjs';

const env = process.env;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ports = offlinePorts(env);
const conn = pgConn(env);
const paths = offlinePaths();

const secret = env.KAKO_OFFLINE_JWT_SECRET;
if (!secret) { process.stderr.write('✗ set KAKO_OFFLINE_JWT_SECRET (the same value used to build the anon key)\n'); process.exit(1); }

const standalone = path.join(REPO, '.next', 'standalone');
const serverJs = path.join(standalone, 'server.js');
if (!fs.existsSync(serverJs)) {
  process.stderr.write('✗ .next/standalone/server.js not found — run the build first (Step 7)\n');
  process.exit(1);
}

// Next standalone ships without static assets / public — copy them in so the UI
// loads CSS/JS and images (the well-known standalone gotcha).
function stageStandaloneAssets() {
  const staticSrc = path.join(REPO, '.next', 'static');
  const staticDst = path.join(standalone, '.next', 'static');
  if (fs.existsSync(staticSrc)) { fs.rmSync(staticDst, { recursive: true, force: true }); fs.cpSync(staticSrc, staticDst, { recursive: true }); }
  const pubSrc = path.join(REPO, 'public');
  const pubDst = path.join(standalone, 'public');
  if (fs.existsSync(pubSrc)) { fs.rmSync(pubDst, { recursive: true, force: true }); fs.cpSync(pubSrc, pubDst, { recursive: true }); }
  log('staged static + public into .next/standalone');
}

function renderPostgrestConf() {
  ensureDir(paths.runDir);
  const conf = [
    `db-uri = "postgres://authenticator@${conn.host}:${conn.port}/${conn.db}"`,
    `db-schemas = "public"`,
    `db-anon-role = "anon"`,
    `jwt-secret = "${secret}"`,
    `server-host = "127.0.0.1"`,
    `server-port = ${ports.postgrest}`,
    `db-pool = 10`,
    ``,
  ].join('\n');
  const out = path.join(paths.runDir, 'postgrest.conf');
  fs.writeFileSync(out, conf, { mode: 0o600 });
  return out;
}

const children = [];
function startPostgrest() {
  const conf = renderPostgrestConf();
  log(`postgrest → 127.0.0.1:${ports.postgrest}`);
  const p = spawn(env.KAKO_PGRST_BIN || 'postgrest', [conf], { stdio: 'inherit', env });
  children.push(p);
}
function startNext() {
  log(`next server → http://127.0.0.1:${ports.app}`);
  const p = spawn(process.execPath, [serverJs], {
    stdio: 'inherit',
    cwd: standalone,
    env: {
      ...env,
      KAKO_OFFLINE: '1',
      PORT: String(ports.app),
      HOSTNAME: '127.0.0.1',
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || `http://127.0.0.1:${ports.app}`,
    },
  });
  children.push(p);
}

function shutdown() {
  log('stopping stack…');
  for (const c of children) { try { c.kill('SIGTERM'); } catch { /* ignore */ } }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

stageStandaloneAssets();
startPostgrest();
startNext();
log(`\n▶ open  http://127.0.0.1:${ports.app}   (login: admin@kako.local / admin)\n  Ctrl+C to stop.`);
