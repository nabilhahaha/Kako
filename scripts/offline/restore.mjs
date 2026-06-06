#!/usr/bin/env node
// ============================================================================
// Offline physical restore (Phase P5)
// ----------------------------------------------------------------------------
//   node scripts/offline/restore.mjs --file <dump> --yes
//   node scripts/offline/restore.mjs --yes            (newest dump)
// Restores a custom-format pg_dump into the running local cluster, then brings
// the schema to head. Cross-OS safe (pg_restore, never a raw data-dir copy).
// Requires --yes (or KAKO_RESTORE_CONFIRM=1) — never restores blindly.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { offlinePaths, pgConn, runPg, tryRunPg, log, fs, path } from './lib.mjs';

const env = process.env;
const paths = offlinePaths();
const conn = pgConn(env);

function arg(name, def) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : def; }
const confirmed = process.argv.includes('--yes') || env.KAKO_RESTORE_CONFIRM === '1';

function newestDump() {
  if (!fs.existsSync(paths.backupsDir)) return null;
  const dumps = fs.readdirSync(paths.backupsDir).filter((f) => f.endsWith('.dump')).sort();
  return dumps.length ? path.join(paths.backupsDir, dumps[dumps.length - 1]) : null;
}

function restore() {
  if (!confirmed) { process.stderr.write('✗ refusing to restore without --yes (no blind restore)\n'); process.exit(2); }

  const file = arg('file', newestDump());
  if (!file || !fs.existsSync(file)) { process.stderr.write(`✗ no dump to restore (file=${file})\n`); process.exit(1); }

  // Cluster must be up.
  if (!tryRunPg('pg_ctl', ['status', '-D', paths.dataDir]).ok) { process.stderr.write('✗ postgres not running — start it first\n'); process.exit(1); }

  log(`restore ${path.basename(file)} → ${conn.db}`);
  // --clean --if-exists rebuilds objects in place; --no-owner because the local
  // superuser owns everything. pg_restore reports benign drop-skips; correctness
  // is asserted by post-restore verification (recovery-cert), not warning count.
  runPg('pg_restore', [
    '-h', conn.host, '-p', String(conn.port), '-U', conn.user, '-d', conn.db,
    '--clean', '--if-exists', '--no-owner', '--no-acl', file,
  ], env, { stdio: ['ignore', 'ignore', 'inherit'] });

  // Bring schema to head in case the dump predates the current migration set.
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath, [path.join(HERE, 'migrate.mjs')], { stdio: 'inherit', env });
  if (r.status !== 0) { process.stderr.write('✗ post-restore migrate failed\n'); process.exit(1); }
  log('restore complete');
}

try {
  restore();
} catch (e) {
  process.stderr.write(`✗ restore failed: ${e.message}\n`);
  process.exit(1);
}
