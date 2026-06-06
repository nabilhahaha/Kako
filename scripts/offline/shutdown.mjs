#!/usr/bin/env node
// ============================================================================
// Offline shutdown (P1/P2)
// ----------------------------------------------------------------------------
// Called by the Tauri shell on exit. The gateway children (PostgREST + the Next
// server) are spawned DETACHED by start-gateway.mjs, so they do NOT die with the
// app — we must terminate them explicitly via their recorded PIDs (RT-3),
// otherwise they keep holding ports 54330/54331 and the NEXT launch fails to
// bind. Then stop PostgreSQL cleanly so the data dir is left consistent.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { offlinePaths, log } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { runDir } = offlinePaths();

/** Kill a recorded gateway child by PID file, tolerating an already-dead PID. */
function killByPidFile(name) {
  const file = path.join(runDir, `${name}.pid`);
  if (!fs.existsSync(file)) return;
  const pid = Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
  if (Number.isInteger(pid) && pid > 0) {
    try { process.kill(pid, 'SIGTERM'); log(`stopped ${name} (pid ${pid})`); }
    catch (e) { if (e?.code !== 'ESRCH') log(`could not stop ${name} (pid ${pid}): ${e?.message ?? e}`); }
  }
  try { fs.rmSync(file, { force: true }); } catch { /* best-effort */ }
}

// Stop the gateway children FIRST (frees the ports), then Postgres.
killByPidFile('next');
killByPidFile('postgrest');

const r = spawnSync(process.execPath, [path.join(HERE, 'db.mjs'), 'stop'], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 0);
