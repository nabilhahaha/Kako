#!/usr/bin/env node
// ============================================================================
// Offline rollback (Phase P7)
// ----------------------------------------------------------------------------
//   node scripts/offline/rollback.mjs --yes [--file <dump>]
// Restores the most recent PRE-UPDATE backup (or an explicit one), reverting the
// database to its state before the last update. Unlike restore.mjs it does NOT
// migrate forward — reverting the schema is the whole point. The Tauri updater
// reverts the app binary; this reverts the data. Requires --yes.
// ============================================================================

import { offlinePaths, pgConn, runPg, tryRunPg, log, fs, path } from './lib.mjs';

const env = process.env;
const paths = offlinePaths();
const conn = pgConn(env);

function arg(name) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : null; }
const confirmed = process.argv.includes('--yes') || env.KAKO_RESTORE_CONFIRM === '1';

function latestPreUpdate() {
  const ptr = path.join(paths.runDir, 'last-pre-update.txt');
  if (fs.existsSync(ptr)) { const f = fs.readFileSync(ptr, 'utf8').trim(); if (fs.existsSync(f)) return f; }
  if (!fs.existsSync(paths.backupsDir)) return null;
  const dumps = fs.readdirSync(paths.backupsDir).filter((f) => f.startsWith('pre-update-') && f.endsWith('.dump')).sort();
  return dumps.length ? path.join(paths.backupsDir, dumps[dumps.length - 1]) : null;
}

try {
  if (!confirmed) { process.stderr.write('✗ refusing to roll back without --yes\n'); process.exit(2); }
  if (!tryRunPg('pg_ctl', ['status', '-D', paths.dataDir]).ok) { process.stderr.write('✗ postgres not running\n'); process.exit(1); }
  const file = arg('file') || latestPreUpdate();
  if (!file || !fs.existsSync(file)) { process.stderr.write(`✗ no pre-update backup to roll back to (file=${file})\n`); process.exit(1); }

  log(`rollback → ${path.basename(file)} (no forward migrate)`);
  runPg('pg_restore', ['-h', conn.host, '-p', String(conn.port), '-U', conn.user, '-d', conn.db, '--clean', '--if-exists', '--no-owner', '--no-acl', file], env, { stdio: ['ignore', 'ignore', 'inherit'] });
  log('rollback complete');
} catch (e) {
  process.stderr.write(`✗ rollback failed: ${e.message}\n`);
  process.exit(1);
}
