#!/usr/bin/env node
// ============================================================================
// Offline bootstrap (Phase P0): one-command first run
// ----------------------------------------------------------------------------
//   node scripts/offline/bootstrap.mjs
// init cluster → start → migrate-to-head → seed. Idempotent end-to-end: safe to
// re-run on an existing data dir (initdb/seed self-skip, migrate applies only
// new files). Leaves Postgres RUNNING for the supervisor/app to use.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function step(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...args], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) { process.stderr.write(`✗ bootstrap step failed: ${script} ${args.join(' ')}\n`); process.exit(r.status ?? 1); }
}

step('db.mjs', ['init']);
step('db.mjs', ['start']);
step('migrate.mjs');
step('seed.mjs');
process.stdout.write('✓ offline bootstrap complete (postgres running)\n');
