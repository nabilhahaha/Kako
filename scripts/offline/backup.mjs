#!/usr/bin/env node
// ============================================================================
// Offline physical backup (Phase P5)
// ----------------------------------------------------------------------------
//   node scripts/offline/backup.mjs [--retention N] [--target /path]
// Creates a custom-format pg_dump (compressed, restorable cross-OS), verifies it
// is readable, prunes old backups by retention, and optionally copies the dump
// to an off-machine target (USB/network). The JSON snapshot path remains the
// in-app erp_create_backup flow; this is the DR-grade physical layer.
// ============================================================================

import { offlinePaths, pgConn, runPg, ensureDir, log, fs, path } from './lib.mjs';
import { spawnSync } from 'node:child_process';

const env = process.env;
const paths = offlinePaths();
const conn = pgConn(env);

function arg(name, def) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : def; }
const retention = Number(arg('retention', env.KAKO_BACKUP_RETENTION || '7'));
const target = arg('target', env.KAKO_BACKUP_TARGET || '');

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

function createDump() {
  ensureDir(paths.backupsDir);
  const file = path.join(paths.backupsDir, `kako-${stamp()}.dump`);
  log(`pg_dump → ${file}`);
  // -Fc custom format (compressed, selective restore, cross-OS). When running
  // de-escalated, the file must be writable by the pg user → write into the
  // pg-owned backups dir.
  runPg('pg_dump', ['-h', conn.host, '-p', String(conn.port), '-U', conn.user, '-d', conn.db, '-Fc', '-f', file]);
  // Integrity: list the archive TOC; a corrupt dump fails here.
  runPg('pg_restore', ['-l', file], env, { stdio: ['ignore', 'ignore', 'inherit'] });
  const size = fs.statSync(file).size;
  log(`dump ok (${(size / 1024).toFixed(1)} KiB)`);
  return file;
}

function prune() {
  const dumps = fs.readdirSync(paths.backupsDir).filter((f) => f.endsWith('.dump')).sort();
  const excess = dumps.length - (retention > 0 ? retention : dumps.length);
  if (excess > 0) {
    for (const f of dumps.slice(0, excess)) { fs.rmSync(path.join(paths.backupsDir, f), { force: true }); log(`pruned ${f}`); }
  }
}

function copyOffMachine(file) {
  if (!target) return;
  try {
    ensureDir(target);
    const dest = path.join(target, path.basename(file));
    fs.copyFileSync(file, dest);
    log(`copied off-machine → ${dest}`);
  } catch (e) {
    process.stderr.write(`⚠ off-machine copy failed (${target}): ${e.message}\n`);
    process.exitCode = 3; // non-fatal: local backup still succeeded
  }
}

try {
  const file = createDump();
  prune();
  copyOffMachine(file);
  process.stdout.write(`${file}\n`);
} catch (e) {
  process.stderr.write(`✗ backup failed: ${e.message}\n`);
  process.exit(1);
}
