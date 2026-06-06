#!/usr/bin/env node
// ============================================================================
// Offline update — DB side (Phase P7)
// ----------------------------------------------------------------------------
//   node scripts/offline/update.mjs
// The Tauri signed updater swaps the app + binaries; THIS handles the database
// safely during an update:
//   1. mandatory pre-update physical backup,
//   2. migrate-to-head (apply any new migrations),
//   3. health check.
// If migrate or health fails, it AUTOMATICALLY ROLLS BACK to the pre-update
// backup and exits non-zero — a half-migrated store never survives an update.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { offlinePaths, pgConn, runPg, tryRunPg, ensureDir, log, fs, path } from './lib.mjs';

const env = process.env;
const paths = offlinePaths();
const conn = pgConn(env);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

function preUpdateBackup() {
  ensureDir(paths.backupsDir);
  const file = path.join(paths.backupsDir, `pre-update-${stamp()}.dump`);
  log(`pre-update backup → ${path.basename(file)}`);
  runPg('pg_dump', ['-h', conn.host, '-p', String(conn.port), '-U', conn.user, '-d', conn.db, '-Fc', '-f', file]);
  // Record the pointer so rollback.mjs can find the latest pre-update snapshot.
  fs.writeFileSync(path.join(paths.runDir, 'last-pre-update.txt'), file);
  return file;
}

function restore(file) {
  log(`rolling back → ${path.basename(file)}`);
  runPg('pg_restore', ['-h', conn.host, '-p', String(conn.port), '-U', conn.user, '-d', conn.db, '--clean', '--if-exists', '--no-owner', '--no-acl', file], env, { stdio: ['ignore', 'ignore', 'inherit'] });
}

function migrate() {
  const r = spawnSync(process.execPath, [path.join(HERE, 'migrate.mjs')], { stdio: 'inherit', env });
  return r.status === 0;
}

function healthy() {
  return tryRunPg('pg_isready', ['-h', conn.host, '-p', String(conn.port), '-U', conn.user, '-d', conn.db]).ok
    && tryRunPg('psql', ['-h', conn.host, '-p', String(conn.port), '-U', conn.user, '-d', conn.db, '-tAc', 'SELECT 1']).ok;
}

try {
  if (!tryRunPg('pg_ctl', ['status', '-D', paths.dataDir]).ok) { process.stderr.write('✗ postgres not running\n'); process.exit(1); }
  const pre = preUpdateBackup();

  if (!migrate()) { process.stderr.write('✗ migrate failed during update\n'); restore(pre); process.exit(1); }
  if (!healthy()) { process.stderr.write('✗ health check failed after update\n'); restore(pre); process.exit(1); }

  log('update applied (schema at head, healthy)');
  process.stdout.write(`${pre}\n`);
} catch (e) {
  process.stderr.write(`✗ update failed: ${e.message}\n`);
  // Best-effort rollback to the recorded pre-update snapshot.
  try {
    const ptr = path.join(paths.runDir, 'last-pre-update.txt');
    if (fs.existsSync(ptr)) restore(fs.readFileSync(ptr, 'utf8').trim());
  } catch { /* ignore */ }
  process.exit(1);
}
