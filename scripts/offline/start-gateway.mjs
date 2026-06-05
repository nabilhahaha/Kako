#!/usr/bin/env node
// ============================================================================
// Offline gateway launcher (P1/P2 scaffolding)
// ----------------------------------------------------------------------------
// Renders the PostgREST config from the template (offline port + local JWT
// secret), starts PostgREST, then starts the standalone Next.js server. The
// Tauri shell (main.rs) calls this after bootstrap and health-gates the window.
//
// The Next server hosts a thin gateway that maps:
//   /rest/v1/*  → PostgREST       (supabase-js data layer)
//   /rpc/*      → PostgREST /rpc  (RPCs)
//   /auth/v1/*  → local issuer    (src/lib/offline/auth.ts)
// so supabase-js needs only a different base URL — wired in P1 runtime.
// ============================================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { offlinePaths, offlinePorts, pgConn, pgTool, log } from './lib.mjs';

const env = process.env;
const ports = offlinePorts(env);
const conn = pgConn(env);
const paths = offlinePaths();

function renderPostgrestConf() {
  const tmplPath = env.KAKO_PGRST_TEMPLATE || path.resolve('src-tauri/resources/postgrest.conf.template');
  const secret = env.KAKO_OFFLINE_JWT_SECRET || JSON.parse(fs.readFileSync(paths.secretsFile, 'utf8')).jwtSecret;
  const conf = fs.readFileSync(tmplPath, 'utf8')
    .replaceAll('${PG_PORT}', String(conn.port))
    .replaceAll('${PG_DB}', conn.db)
    .replaceAll('${PGRST_PORT}', String(ports.postgrest))
    .replaceAll('${JWT_SECRET}', secret);
  const out = path.join(paths.runDir, 'postgrest.conf');
  fs.mkdirSync(paths.runDir, { recursive: true });
  fs.writeFileSync(out, conf, { mode: 0o600 });
  return out;
}

function startPostgrest(confPath) {
  log(`postgrest on 127.0.0.1:${ports.postgrest}`);
  const p = spawn(pgTool('postgrest', env), [confPath], { stdio: 'inherit', env });
  p.on('exit', (code) => log(`postgrest exited (${code})`));
  return p;
}

function startNext() {
  log(`next server on 127.0.0.1:${ports.app}`);
  const serverJs = env.KAKO_NEXT_SERVER || path.resolve('.next/standalone/server.js');
  const p = spawn(process.execPath, [serverJs], {
    stdio: 'inherit',
    env: { ...env, PORT: String(ports.app), HOSTNAME: '127.0.0.1' },
  });
  p.on('exit', (code) => log(`next server exited (${code})`));
  return p;
}

try {
  const conf = renderPostgrestConf();
  startPostgrest(conf);
  startNext();
} catch (e) {
  process.stderr.write(`✗ gateway start failed: ${e.message}\n`);
  process.exit(1);
}
