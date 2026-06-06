#!/usr/bin/env node
// ============================================================================
// Offline shutdown (P1/P2 scaffolding)
// ----------------------------------------------------------------------------
// Called by the Tauri shell on exit: stops PostgreSQL cleanly so the data dir is
// left consistent. PostgREST + the Next server are children of the app and exit
// with it; stopping Postgres is the part that must be graceful.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(HERE, 'db.mjs'), 'stop'], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 0);
